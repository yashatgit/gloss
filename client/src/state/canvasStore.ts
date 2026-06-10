import { create } from 'zustand';
import type {
  Anchor,
  BranchNode,
  CanvasNode,
  ChatMessage,
  Doc,
  Position,
} from '@reader/shared';
import * as api from '../api/client';

interface CanvasState {
  doc: Doc | null;
  nodes: CanvasNode[];
  /** branchId → live assistant buffer ('' while waiting for first token). */
  streaming: Record<string, string>;
  /** branchId → last error message. */
  errors: Record<string, string>;

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
  abortMessage(branchId: string): void;
  deleteBranch(branchId: string): Promise<void>;
}

// Non-reactive: components key off `streaming` for UI state.
const aborters = new Map<string, AbortController>();

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

  setCanvas: (doc, nodes) => set({ doc, nodes, streaming: {}, errors: {} }),

  loadCanvas: async (docId) => {
    const { document, nodes } = await api.getCanvas(docId);
    set({ doc: document, nodes, streaming: {}, errors: {} });
  },

  reset: () => set({ doc: null, nodes: [], streaming: {}, errors: {} }),

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
    const controller = new AbortController();
    aborters.set(branchId, controller);
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const errors = { ...s.errors };
      delete errors[branchId];
      return {
        nodes: updateBranch(s.nodes, branchId, (b) => ({
          ...b,
          messages: [...b.messages, userMsg],
        })),
        streaming: { ...s.streaming, [branchId]: '' },
        errors,
      };
    });

    const clearStreaming = (s: CanvasState) => {
      const streaming = { ...s.streaming };
      delete streaming[branchId];
      return streaming;
    };

    try {
      await api.sendMessage(
        branchId,
        text,
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
                      role: 'assistant',
                      text: partial,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }))
              : s.nodes,
          errors: aborted
            ? s.errors
            : {
                ...s.errors,
                [branchId]: err instanceof Error ? err.message : String(err),
              },
        };
      });
    } finally {
      aborters.delete(branchId);
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
      return { nodes: s.nodes.filter((n) => !doomed.has(n.id)) };
    });
  },
}));
