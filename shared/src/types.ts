export type DocumentSource = 'text' | 'markdown' | 'image' | 'pdf';

export interface Doc {
  id: string;
  title: string;
  source: DocumentSource;
  /** Canonical rendered content. For images this is the vision transcription. */
  markdown: string;
  /** Relative path inside the document's data dir, e.g. "assets/original.png". */
  originalImagePath?: string;
  createdAt: string;
  /** For image/PDF docs: the cost of the one-time transcription. */
  importUsage?: Usage;
  importModel?: string;
}

/**
 * Where a branch hangs off. Offsets index into the plain text of the anchored
 * unit (the document markdown, or one chat message's text) — both are
 * immutable after creation, so offsets are stable. quote/prefix/suffix are
 * kept for prompt building and as a relocation fallback.
 */
export interface Anchor {
  /** Canvas node containing the selection (document node OR branch node). */
  nodeId: string;
  /** Set when the selection is inside a chat message → nested branching. */
  messageId?: string;
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  usage?: Usage;
  /** Model that produced this message — used to attribute cost accurately
   * even when the document's selected model changes between turns. */
  model?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface DocumentNode {
  id: string;
  kind: 'document';
  docId: string;
  position: Position;
  width: number;
  height?: number;
}

export interface BranchNode {
  id: string;
  kind: 'branch';
  docId: string;
  position: Position;
  /** Document node or another branch node. */
  parentNodeId: string;
  anchor: Anchor;
  title: string;
  messages: ChatMessage[];
  /** User-resized dimensions (px). Absent → default size. */
  width?: number;
  height?: number;
}

export type CanvasNode = DocumentNode | BranchNode;

export interface Canvas {
  nodes: CanvasNode[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  createdAt: string;
}
