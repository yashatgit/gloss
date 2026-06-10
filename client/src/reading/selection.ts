import type { Anchor } from '@reader/shared';

/**
 * Anchors address offsets into the RENDERED plain text of an anchor root
 * (`element.textContent` order) — the same coordinate space highlight
 * injection uses. The server relocates quotes inside markdown source by
 * string search, so the two spaces never need to agree exactly.
 */

const CONTEXT_CHARS = 32;

export function anchorRootOf(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return (el?.closest('[data-anchor-root]') as HTMLElement | null) ?? null;
}

/** Plain-text offset of a (container, offset) boundary within root. */
function boundaryOffset(root: Element, container: Node, offset: number): number | null {
  if (!root.contains(container)) return null;
  const r = document.createRange();
  r.selectNodeContents(root);
  try {
    r.setEnd(container, offset);
  } catch {
    return null;
  }
  return r.toString().length;
}

export interface ResolvedSelection {
  anchor: Anchor;
  rect: DOMRect;
}

/** Resolve the current window selection into an Anchor, or null if unusable. */
export function resolveSelection(): ResolvedSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  const startRoot = anchorRootOf(range.startContainer);
  const endRoot = anchorRootOf(range.endContainer);
  if (!startRoot || startRoot !== endRoot) return null;
  const nodeId = startRoot.dataset.nodeId;
  if (!nodeId) return null;

  const quote = range.toString();
  if (!quote.trim()) return null;

  const start = boundaryOffset(startRoot, range.startContainer, range.startOffset);
  const end = boundaryOffset(startRoot, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const all = startRoot.textContent ?? '';
  return {
    anchor: {
      nodeId,
      messageId: startRoot.dataset.messageId || undefined,
      start,
      end,
      quote,
      prefix: all.slice(Math.max(0, start - CONTEXT_CHARS), start),
      suffix: all.slice(end, end + CONTEXT_CHARS),
    },
    rect: range.getBoundingClientRect(),
  };
}
