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
import { tidyPositions } from '../canvas/layout';

const MODEL_STORAGE_KEY = 'reader.selectedModel';

function loadStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

interface CanvasState {
  doc: Doc | null;
  nodes: CanvasNode[];
  /** branchId → live assistant buffer ('' while waiting for first token). */
  streaming: Record<string, string>;
  /** branchId → last error message. */
  errors: Record<string, string>;
  /** Branch nodes collapsed to just their header (client-only UI state). */
  collapsed: Record<string, boolean>;
  /** Node id to briefly pulse (e.g. a branch's source span after focus). */
  flashNodeId: string | null;

  toggleCollapsed(branchId: string): void;
  tidy(): void;
  flash(nodeId: string): void;

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

  createBranch(
    parentNodeId: string,
    anchor: Anchor,
    title: string,
    position: Position | null,
    firstMessage?: string,
  ): Promise<string | null>;
  sendMessage(branchId: string, text: string): Promise<void>;
  regenerate(branchId: string): Promise<void>;
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
    return { streaming: { ...s.streaming, [branchId]: '' }, errors };
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
  collapsed: {},
  flashNodeId: null,

  toggleCollapsed: (branchId) =>
    set((s) => ({ collapsed: { ...s.collapsed, [branchId]: !s.collapsed[branchId] } })),

  tidy: () => {
    const { doc, nodes, collapsed } = get();
    if (!doc) return;
    const positions = tidyPositions(nodes, collapsed);
    set({
      nodes: nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id]! } : n)),
    });
    for (const [id, pos] of Object.entries(positions)) {
      void api.patchPosition(id, doc.id, pos.x, pos.y);
    }
  },

  flash: (nodeId) => {
    set({ flashNodeId: nodeId });
    setTimeout(() => {
      if (get().flashNodeId === nodeId) set({ flashNodeId: null });
    }, 1200);
  },

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

  setCanvas: (doc, nodes) => set({ doc, nodes, streaming: {}, errors: {}, collapsed: {}, flashNodeId: null }),

  loadCanvas: async (docId) => {
    const { document, nodes } = await api.getCanvas(docId);
    set({ doc: document, nodes, streaming: {}, errors: {}, collapsed: {}, flashNodeId: null });
  },

  reset: () => set({ doc: null, nodes: [], streaming: {}, errors: {}, collapsed: {}, flashNodeId: null }),

  moveNodeLocal: (nodeId, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })),

  persistPosition: (nodeId, position) => {
    const doc = get().doc;
    if (!doc) return;
    get().moveNodeLocal(nodeId, position);
    void api.patchPosition(nodeId, doc.id, position.x, position.y);
  },

  createBranch: async (parentNodeId, anchor, title, position, firstMessage) => {
    const doc = get().doc;
    if (!doc) return null;
    try {
      const { node } = await api.createBranch(doc.id, { parentNodeId, anchor, title });
      if (position) node.position = position;
      set((s) => ({ nodes: [...s.nodes, node] }));
      if (position) {
        void api.patchPosition(node.id, doc.id, position.x, position.y);
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
      return { nodes: s.nodes.filter((n) => !doomed.has(n.id)) };
    });
  },
}));
