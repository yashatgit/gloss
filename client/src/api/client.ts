import type {
  Anchor,
  BranchNode,
  Canvas,
  CanvasNode,
  ChatMessage,
  Doc,
  DocumentSummary,
  ModelInfo,
  Provider,
  SSEError,
  Usage,
} from '@reader/shared';
import { postSSE } from './sse';

// Relative base only — same origin in dev (Vite proxy) and in Electron later.
const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function createDocument(source: 'text' | 'markdown', text: string) {
  return fetch(`${BASE}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, text }),
  }).then((r) => json<{ document: Doc; canvas: Canvas }>(r));
}

export function getConfig() {
  return fetch(`${BASE}/config`).then((r) =>
    json<{ providers: Provider[]; models: ModelInfo[] }>(r),
  );
}

export function listDocuments() {
  return fetch(`${BASE}/documents`).then((r) =>
    json<{ documents: DocumentSummary[] }>(r),
  );
}

export function getCanvas(docId: string) {
  return fetch(`${BASE}/canvas/${docId}`).then((r) =>
    json<{ document: Doc; nodes: CanvasNode[] }>(r),
  );
}

export function createBranch(
  docId: string,
  params: { parentNodeId: string; anchor: Anchor; title: string },
) {
  return fetch(`${BASE}/documents/${docId}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).then((r) => json<{ node: BranchNode }>(r));
}

export interface ChatHandlers {
  onStart?: (messageId: string) => void;
  onDelta: (text: string) => void;
  onDone: (message: ChatMessage, usage: Usage) => void;
  onError: (error: SSEError) => void;
}

export function sendMessage(
  branchId: string,
  text: string,
  model: string,
  handlers: ChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}/branches/${branchId}/messages`,
    { text, model },
    (event, data) => {
      switch (event) {
        case 'start':
          handlers.onStart?.((data as { messageId: string }).messageId);
          break;
        case 'delta':
          handlers.onDelta((data as { text: string }).text);
          break;
        case 'done': {
          const d = data as { message: ChatMessage; usage: Usage };
          handlers.onDone(d.message, d.usage);
          break;
        }
        case 'error':
          handlers.onError(data as SSEError);
          break;
      }
    },
    signal,
  );
}

export interface ImportHandlers {
  onDelta: (text: string) => void;
  onDone: (document: Doc, canvas: Canvas) => void;
  onError: (error: SSEError) => void;
}

export function importImage(
  media_type: string,
  data: string,
  model: string,
  handlers: ImportHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return postSSE(
    `${BASE}/documents/import-image`,
    { media_type, data, model },
    (event, payload) => {
      switch (event) {
        case 'delta':
          handlers.onDelta((payload as { text: string }).text);
          break;
        case 'done': {
          const d = payload as { document: Doc; canvas: Canvas };
          handlers.onDone(d.document, d.canvas);
          break;
        }
        case 'error':
          handlers.onError(payload as SSEError);
          break;
      }
    },
    signal,
  );
}

export function patchPosition(nodeId: string, docId: string, x: number, y: number) {
  return fetch(`${BASE}/nodes/${nodeId}/position`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, x, y }),
  });
}

export function deleteBranch(branchId: string) {
  return fetch(`${BASE}/branches/${branchId}`, { method: 'DELETE' });
}
