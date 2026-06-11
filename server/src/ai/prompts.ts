import type { Anchor, BranchNode, CanvasNode, Doc } from '@gloss/shared';
import type { DocState } from '../store/store';
import type { NeutralMessage } from './providers/types';

/**
 * Cache correctness lives in this file. The system prefix (instructions +
 * document) must be byte-identical across every branch and every turn of a
 * document so they all read one cache entry. Never interpolate anything
 * volatile (dates, ids, per-branch data) into the system blocks — per-branch
 * context goes in the first user message instead.
 */
export const SYSTEM_INSTRUCTIONS = `You are a reading companion embedded in a document-reading app. The full source document the user is reading is provided below. The user selects passages while reading and "branches off" to discuss them with you.

Ground your answers in the document: account for what comes before and after the selection, and quote the document when it helps. Answer in the context of the selected passage unless the user asks to go broader. Be clear and concise — the user is mid-reading and wants understanding, not an essay. Use markdown formatting.`;

/** The document wrapped for the cacheable system prefix (provider-neutral). */
export function documentBlock(doc: Doc): string {
  return `<document title=${JSON.stringify(doc.title)}>\n${doc.markdown}\n</document>`;
}

function findNode(state: DocState, nodeId: string): CanvasNode | undefined {
  return state.canvas.nodes.find((n) => n.id === nodeId);
}

/** Plain text of the unit an anchor indexes into (document markdown or one message). */
function anchoredUnitText(state: DocState, anchor: Anchor): string {
  const node = findNode(state, anchor.nodeId);
  if (!node) return '';
  if (node.kind === 'document') return state.document.markdown;
  if (anchor.messageId) {
    return node.messages.find((m) => m.id === anchor.messageId)?.text ?? '';
  }
  return '';
}

const SURROUNDING_CAP = 800;

/**
 * Anchor offsets index the client's RENDERED plain text, not the markdown
 * source — relocate the exact quote in the source by string search, using
 * the stored offset as a tie-breaker between multiple occurrences.
 */
function locateQuote(text: string, anchor: Anchor): { start: number; end: number } {
  let idx = text.indexOf(anchor.quote);
  if (idx === -1) {
    const start = Math.min(Math.max(0, anchor.start), text.length);
    return { start, end: Math.min(anchor.end, text.length) };
  }
  let best = idx;
  let bestDist = Math.abs(idx - anchor.start);
  while (idx !== -1) {
    const dist = Math.abs(idx - anchor.start);
    if (dist < bestDist) {
      best = idx;
      bestDist = dist;
    }
    idx = text.indexOf(anchor.quote, idx + 1);
  }
  return { start: best, end: best + anchor.quote.length };
}

/** Expand the anchored span to paragraph boundaries, capped per side. */
function surroundingParagraph(text: string, anchor: Anchor): string {
  const { start: qStart, end: qEnd } = locateQuote(text, anchor);
  let start = text.lastIndexOf('\n\n', qStart);
  start = start === -1 ? 0 : start + 2;
  let end = text.indexOf('\n\n', qEnd);
  if (end === -1) end = text.length;
  start = Math.max(start, qStart - SURROUNDING_CAP);
  end = Math.min(end, qEnd + SURROUNDING_CAP);
  return text.slice(start, end);
}

/**
 * For nested branches: the chain of ancestor selections from the document
 * down to this branch's parent, plus the parent message being interrogated.
 * Ancestor full transcripts are deliberately omitted (the document itself is
 * always present via the system prefix).
 */
function buildBreadcrumb(state: DocState, anchor: Anchor): string {
  const parent = findNode(state, anchor.nodeId);
  if (!parent || parent.kind !== 'branch') return '';

  const quotes: string[] = [];
  let cur: CanvasNode | undefined = parent;
  while (cur && cur.kind === 'branch') {
    quotes.unshift(cur.anchor.quote);
    cur = findNode(state, cur.anchor.nodeId);
  }
  const chain = ['the document', ...quotes.map((q) => `a branch on "${q}"`)].join(' → ');

  let anchoredMessage = '';
  if (anchor.messageId) {
    const msg = parent.messages.find((m) => m.id === anchor.messageId);
    if (msg) {
      anchoredMessage = `\n<anchored_message role="${msg.role}">\n${msg.text}\n</anchored_message>`;
    }
  }

  return `<breadcrumb>This is a nested branch. Path: ${chain}. The user has now selected text inside the ${anchor.messageId ? 'message quoted below' : 'parent branch'}.</breadcrumb>${anchoredMessage}\n`;
}

/**
 * The anchor preamble is prepended to the branch's first user message at
 * request time (it is NOT stored in the message, so the UI shows clean text).
 * It is deterministic for a given branch, so multi-turn requests keep a
 * stable message prefix.
 */
export function buildFirstTurnText(
  state: DocState,
  branch: BranchNode,
  userText: string,
): string {
  const unitText = anchoredUnitText(state, branch.anchor);
  const surrounding = surroundingParagraph(unitText, branch.anchor);
  const breadcrumb = buildBreadcrumb(state, branch.anchor);
  return `<branch_context>
${breadcrumb}<selection>${branch.anchor.quote}</selection>
<surrounding>${surrounding}</surrounding>
</branch_context>

${userText}`;
}

export function toNeutralMessages(state: DocState, branch: BranchNode): NeutralMessage[] {
  let firstUserSeen = false;
  return branch.messages.map((m) => {
    let text = m.text;
    if (m.role === 'user' && !firstUserSeen) {
      firstUserSeen = true;
      text = buildFirstTurnText(state, branch, m.text);
    }
    return { role: m.role, content: text };
  });
}
