import type { Usage } from '@gloss/shared';

/** Provider-neutral chat message (first-turn anchor preamble already injected). */
export interface NeutralMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Provider-neutral stream chunk. Providers yield deltas, then one final. */
export type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'final'; text: string; usage: Usage; model: string };

export interface ChatArgs {
  model: string;
  /** Stable instructions (cacheable prefix). */
  instructions: string;
  /** The whole document (cacheable prefix). */
  document: string;
  messages: NeutralMessage[];
  signal: AbortSignal;
}

export interface VisionArgs {
  model: string;
  mediaType: string;
  /** base64 image data (no data: prefix). */
  data: string;
  prompt: string;
  signal: AbortSignal;
}

export interface ChatProvider {
  streamChat(args: ChatArgs): AsyncIterable<StreamChunk>;
  streamVision(args: VisionArgs): AsyncIterable<StreamChunk>;
}

export const EMPTY_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};
