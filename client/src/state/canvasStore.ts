import { create } from 'zustand';
import {
  DEFAULT_MODEL,
  getModel,
  type Anchor,
  type BranchNode,
  type CanvasNode,
  type ChatMessage,
  type Doc,
  type ModelInfo,
  type Position,
  type Provider,
} from '@reader/shared';
import * as api from '../api/client';

const MODEL_STORAGE_KEY = 'reader.selectedModel';
const THEME_KEY = 'reader.theme';
const FONT_KEY = 'reader.fontScale';

export type Theme = 'light' | 'dark';
export const FONT_MIN = 0.85;
export const FONT_MAX = 1.5;
const FONT_STEP = 0.1;

function loadStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function loadTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme | null) ?? systemTheme();
  } catch {
    return 'light';
  }
}

function loadFontScale(): number {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    return v >= FONT_MIN && v <= FONT_MAX ? v : 1;
  } catch {
    return 1;
  }
}

/** Side-effects applied to <html> so CSS variables pick them up. */
export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}
export function applyFontScale(scale: number): void {
  if (typeof document !== 'undefined')
    document.documentElement.style.setProperty('--reading-scale', String(scale));
}

interface CanvasState {
  doc: Doc | null;
  nodes: CanvasNode[];
  /** branchId → live assistant buffer ('' while waiting for first token). */
  streaming: Record<string, string>;
  /** branchId → last error message. */
  errors: Record<string, string>;
  /** branchId → true while an image is generating. */
  imageLoading: Record<string, boolean>;
  /** Branch nodes collapsed to just their header (client-only UI state). */
  collapsed: Record<string, boolean>;
  /** Node id to briefly pulse (e.g. a branch's source span after focus). */
  flashNodeId: string | null;
  /** Node id the viewport should glide to (set on new request; cleared after). */
  focusTarget: string | null;
  /** Bumped on major layout changes (create/expand/collapse/delete/reply done)
   *  to trigger an auto-tidy. NOT bumped on load, so saved layouts persist. */
  tidyNonce: number;

  toggleCollapsed(branchId: string): void;
  applyPositions(positions: Record<string, Position>): void;
  flash(nodeId: string): void;
  requestFocus(nodeId: string): void;
  clearFocus(): void;

  /** Display preferences (persisted, applied to <html>). */
  theme: Theme;
  fontScale: number;
  toggleTheme(): void;
  setFontScale(scale: number): void;
  bumpFontScale(delta: number): void;

  /** Model selection (global app setting, persisted to localStorage). */
  selectedModel: string;
  models: ModelInfo[];
  configuredProviders: Provider[];
  setModel(id: string): void;
  loadConfig(): Promise<void>;

  setCanvas(doc: Doc, nodes: CanvasNode[]): void;
  loadCanvas(docId: string): Promise<void>;
  reset(): void;

  moveNodeLocal(nodeId: string, position: Position): void;
  persistPosition(nodeId: string, position: Position): void;
  resizeBranchLocal(nodeId: string, width: number, height: number): void;
  persistBranchSize(nodeId: string): void;

  createBranch(
    parentNodeId: string,
    anchor: Anchor,
    title: string,
    position: Position | null,
    firstMessage?: string,
  ): Promise<string | null>;
  sendMessage(branchId: string, text: string): Promise<void>;
  regenerate(branchId: string): Promise<void>;
  generateImage(branchId: string, prompt: string): Promise<void>;
  abortMessage(branchId: string): void;
  deleteBranch(branchId: string): Promise<void>;
}

// Non-reactive: components key off `streaming` for UI state.
const aborters = new Map<string, AbortController>();

type SetFn = (fn: (s: CanvasState) => Partial<CanvasState>) => void;
type GetFn = () => CanvasState;

/** Shared streaming consumer for sendMessage + regenerate. */
async function consumeStream(
  set: SetFn,
  get: GetFn,
  branchId: string,
  invoke: (handlers: api.ChatHandlers, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  aborters.set(branchId, controller);
  set((s) => {
    const errors = { ...s.errors };
    delete errors[branchId];
    // Glide the viewport to the branch the request belongs to.
    return { streaming: { ...s.streaming, [branchId]: '' }, errors, focusTarget: branchId };
  });

  const clearStreaming = (s: CanvasState) => {
    const streaming = { ...s.streaming };
    delete streaming[branchId];
    return streaming;
  };

  try {
    await invoke(
      {
        onDelta: (t) =>
          set((s) => ({
            streaming: { ...s.streaming, [branchId]: (s.streaming[branchId] ?? '') + t },
          })),
        onDone: (message) =>
          set((s) => ({
            nodes: updateBranch(s.nodes, branchId, (b) => ({
              ...b,
              messages: [...b.messages, message],
            })),
            streaming: clearStreaming(s),
            // Reply reached final size → re-tidy so it doesn't overlap below.
            tidyNonce: s.tidyNonce + 1,
          })),
        onError: (e) =>
          set((s) => ({
            streaming: clearStreaming(s),
            errors: { ...s.errors, [branchId]: `${e.type} (${e.status}): ${e.message}` },
          })),
      },
      controller.signal,
    );
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    set((s) => {
      const partial = s.streaming[branchId];
      return {
        streaming: clearStreaming(s),
        // Keep what already streamed (the server persists its copy too).
        nodes:
          aborted && partial
            ? updateBranch(s.nodes, branchId, (b) => ({
                ...b,
                messages: [
                  ...b.messages,
                  {
                    id: `partial-${Date.now()}`,
                    role: 'assistant' as const,
                    text: partial,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }))
            : s.nodes,
        errors: aborted
          ? s.errors
          : { ...s.errors, [branchId]: err instanceof Error ? err.message : String(err) },
      };
    });
  } finally {
    aborters.delete(branchId);
  }
}

function updateBranch(
  nodes: CanvasNode[],
  branchId: string,
  fn: (b: BranchNode) => BranchNode,
): CanvasNode[] {
  return nodes.map((n) => (n.kind === 'branch' && n.id === branchId ? fn(n) : n));
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  doc: null,
  nodes: [],
  streaming: {},
  errors: {},
  imageLoading: {},
  collapsed: {},
  flashNodeId: null,
  focusTarget: null,
  tidyNonce: 0,

  toggleCollapsed: (branchId) =>
    set((s) => ({
      collapsed: { ...s.collapsed, [branchId]: !s.collapsed[branchId] },
      tidyNonce: s.tidyNonce + 1,
    })),

  requestFocus: (nodeId) => set({ focusTarget: nodeId }),
  clearFocus: () => set({ focusTarget: null }),

  applyPositions: (positions) => {
    const { doc, nodes } = get();
    if (!doc) return;
    set({
      nodes: nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id]! } : n)),
    });
    for (const [id, pos] of Object.entries(positions)) {
      void api.patchNode(id, doc.id, { x: pos.x, y: pos.y });
    }
  },

  flash: (nodeId) => {
    set({ flashNodeId: nodeId });
    setTimeout(() => {
      if (get().flashNodeId === nodeId) set({ flashNodeId: null });
    }, 1200);
  },

  theme: loadTheme(),
  fontScale: loadFontScale(),

  toggleTheme: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
    applyTheme(theme);
    set({ theme });
  },

  setFontScale: (scale) => {
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(scale * 100) / 100));
    try {
      localStorage.setItem(FONT_KEY, String(clamped));
    } catch {
      // ignore
    }
    applyFontScale(clamped);
    set({ fontScale: clamped });
  },

  bumpFontScale: (delta) => get().setFontScale(get().fontScale + delta * FONT_STEP),

  selectedModel: loadStoredModel(),
  models: [],
  configuredProviders: [],

  setModel: (id) => {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      // ignore storage failures
    }
    set({ selectedModel: id });
  },

  loadConfig: async () => {
    const { providers, models } = await api.getConfig();
    set({ configuredProviders: providers, models });
    // If the persisted model's provider has no key, fall back to the first
    // model of a configured provider so requests don't fail out of the gate.
    const current = getModel(get().selectedModel);
    if (!current || !providers.includes(current.provider)) {
      const usable = models.find((m) => providers.includes(m.provider));
      if (usable) get().setModel(usable.id);
    }
  },

  setCanvas: (doc, nodes) => set({ doc, nodes, streaming: {}, errors: {}, imageLoading: {}, collapsed: {}, flashNodeId: null, focusTarget: null }),

  loadCanvas: async (docId) => {
    const { document, nodes } = await api.getCanvas(docId);
    set({ doc: document, nodes, streaming: {}, errors: {}, imageLoading: {}, collapsed: {}, flashNodeId: null, focusTarget: null });
  },

  reset: () => set({ doc: null, nodes: [], streaming: {}, errors: {}, imageLoading: {}, collapsed: {}, flashNodeId: null, focusTarget: null }),

  moveNodeLocal: (nodeId, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })),

  persistPosition: (nodeId, position) => {
    const doc = get().doc;
    if (!doc) return;
    get().moveNodeLocal(nodeId, position);
    void api.patchNode(nodeId, doc.id, { x: position.x, y: position.y });
  },

  resizeBranchLocal: (nodeId, width, height) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.kind === 'branch' && n.id === nodeId ? { ...n, width, height } : n,
      ),
    })),

  persistBranchSize: (nodeId) => {
    const doc = get().doc;
    if (!doc) return;
    const node = get().nodes.find((n) => n.id === nodeId);
    if (node?.kind !== 'branch' || node.width == null || node.height == null) return;
    void api.patchNode(nodeId, doc.id, { width: node.width, height: node.height });
  },

  createBranch: async (parentNodeId, anchor, title, position, firstMessage) => {
    const doc = get().doc;
    if (!doc) return null;
    try {
      const { node } = await api.createBranch(doc.id, { parentNodeId, anchor, title });
      if (position) node.position = position;
      // Glide to the new branch (sendMessage will re-affirm focus on stream start).
      set((s) => ({ nodes: [...s.nodes, node], focusTarget: node.id, tidyNonce: s.tidyNonce + 1 }));
      if (position) {
        void api.patchNode(node.id, doc.id, { x: position.x, y: position.y });
      }
      if (firstMessage) {
        void get().sendMessage(node.id, firstMessage);
      }
      return node.id;
    } catch (err) {
      set((s) => ({
        errors: { ...s.errors, global: err instanceof Error ? err.message : String(err) },
      }));
      return null;
    }
  },

  sendMessage: async (branchId, text) => {
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      nodes: updateBranch(s.nodes, branchId, (b) => ({
        ...b,
        messages: [...b.messages, userMsg],
      })),
    }));
    await consumeStream(set, get, branchId, (handlers, signal) =>
      api.sendMessage(branchId, text, get().selectedModel, handlers, signal),
    );
  },

  regenerate: async (branchId) => {
    // Optimistically drop the trailing assistant turn (server does the same).
    set((s) => ({
      nodes: updateBranch(s.nodes, branchId, (b) => {
        const messages = b.messages.slice();
        if (messages.at(-1)?.role === 'assistant') messages.pop();
        return { ...b, messages };
      }),
    }));
    await consumeStream(set, get, branchId, (handlers, signal) =>
      api.regenerate(branchId, get().selectedModel, handlers, signal),
    );
  },

  generateImage: async (branchId, prompt) => {
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      text: prompt,
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const errors = { ...s.errors };
      delete errors[branchId];
      return {
        nodes: updateBranch(s.nodes, branchId, (b) => ({ ...b, messages: [...b.messages, userMsg] })),
        imageLoading: { ...s.imageLoading, [branchId]: true },
        errors,
        focusTarget: branchId,
      };
    });
    const clearLoading = (s: CanvasState) => {
      const imageLoading = { ...s.imageLoading };
      delete imageLoading[branchId];
      return imageLoading;
    };
    try {
      const { message } = await api.generateImage(branchId, prompt);
      set((s) => ({
        nodes: updateBranch(s.nodes, branchId, (b) => ({ ...b, messages: [...b.messages, message] })),
        imageLoading: clearLoading(s),
        tidyNonce: s.tidyNonce + 1,
      }));
    } catch (err) {
      set((s) => ({
        imageLoading: clearLoading(s),
        errors: { ...s.errors, [branchId]: err instanceof Error ? err.message : String(err) },
      }));
    }
  },

  abortMessage: (branchId) => aborters.get(branchId)?.abort(),

  deleteBranch: async (branchId) => {
    await api.deleteBranch(branchId);
    // Remove the branch and all descendants (same cascade as the server).
    set((s) => {
      const doomed = new Set([branchId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of s.nodes) {
          if (n.kind === 'branch' && doomed.has(n.parentNodeId) && !doomed.has(n.id)) {
            doomed.add(n.id);
            grew = true;
          }
        }
      }
      return { nodes: s.nodes.filter((n) => !doomed.has(n.id)), tidyNonce: s.tidyNonce + 1 };
    });
  },
}));
