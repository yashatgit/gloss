import { useLayoutEffect, type RefObject } from 'react';

export interface HighlightSpec {
  branchId: string;
  start: number;
  end: number;
  /** Exact selected text — used to relocate if offsets drift from the rendered text. */
  quote: string;
}

/**
 * Injects <mark data-branch-id> elements into rendered markdown by splitting
 * text nodes at the stored plain-text offsets (the same coordinate space
 * selection.ts records). Cleanup unwraps the marks so React reconciliation
 * never sees foreign DOM.
 */
export function useHighlights(
  ref: RefObject<HTMLElement | null>,
  highlights: HighlightSpec[],
  /** Extra dep that signals the rendered content changed (e.g. the markdown). */
  contentKey: string,
  onMarkClick?: (branchId: string) => void,
): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || highlights.length === 0) return;

    const marks: HTMLElement[] = [];
    for (const h of highlights) {
      marks.push(...injectMarks(root, h, onMarkClick));
    }
    return () => {
      for (const mark of marks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      }
    };
  }, [ref, highlights, contentKey, onMarkClick]);
}

/**
 * Verify the offsets actually cover the quote in this root's rendered text;
 * if not, relocate by searching for the quote occurrence nearest the stored
 * offset. Returns null when the quote can't be found at all.
 */
function resolveRange(
  root: HTMLElement,
  spec: HighlightSpec,
): { start: number; end: number } | null {
  const text = root.textContent ?? '';
  if (text.slice(spec.start, spec.end) === spec.quote) {
    return { start: spec.start, end: spec.end };
  }
  let idx = text.indexOf(spec.quote);
  if (idx === -1) return null;
  let best = idx;
  let bestDist = Math.abs(idx - spec.start);
  while (idx !== -1) {
    const dist = Math.abs(idx - spec.start);
    if (dist < bestDist) {
      best = idx;
      bestDist = dist;
    }
    idx = text.indexOf(spec.quote, idx + 1);
  }
  return { start: best, end: best + spec.quote.length };
}

function injectMarks(
  root: HTMLElement,
  spec: HighlightSpec,
  onMarkClick?: (branchId: string) => void,
): HTMLElement[] {
  const range = resolveRange(root, spec);
  if (!range) return [];
  const marks: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  // Collect first — splitting while walking confuses the TreeWalker.
  const targets: { node: Text; from: number; to: number }[] = [];
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const len = textNode.textContent?.length ?? 0;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    pos = nodeEnd;
    if (nodeEnd <= range.start) continue;
    if (nodeStart >= range.end) break;
    targets.push({
      node: textNode as Text,
      from: Math.max(0, range.start - nodeStart),
      to: Math.min(len, range.end - nodeStart),
    });
  }

  for (const { node, from, to } of targets) {
    if (to <= from) continue;
    let target = node;
    if (from > 0) target = target.splitText(from);
    if (to - from < (target.textContent?.length ?? 0)) target.splitText(to - from);

    const mark = document.createElement('mark');
    mark.dataset.branchId = spec.branchId;
    if (onMarkClick) {
      mark.addEventListener('click', (e) => {
        e.stopPropagation();
        onMarkClick(spec.branchId);
      });
    }
    target.parentNode?.replaceChild(mark, target);
    mark.appendChild(target);
    marks.push(mark);
  }
  return marks;
}
