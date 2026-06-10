import type { ChatMessage, Usage, Doc, Canvas } from './types';

/** Events for POST /api/branches/:id/messages */
export type ChatSSEEvent =
  | { event: 'start'; data: { messageId: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { message: ChatMessage; usage: Usage } }
  | { event: 'error'; data: SSEError };

/** Events for POST /api/documents/import-image */
export type ImportSSEEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { document: Doc; canvas: Canvas } }
  | { event: 'error'; data: SSEError };

export interface SSEError {
  status: number;
  type: string;
  message: string;
}
