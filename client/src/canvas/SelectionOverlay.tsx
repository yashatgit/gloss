import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../state/canvasStore';
import { resolveSelection, type ResolvedSelection } from '../reading/selection';

const BRANCH_WIDTH = 380;
const BRANCH_GAP = 120;
const NUDGE = 260;

type QuickAction = 'explain' | 'context' | 'ask';

const FIRST_MESSAGES: Record<Exclude<QuickAction, 'ask'>, string> = {
  explain: 'Explain this.',
  context: 'Give me background and context for this.',
};

/**
 * Floating "branch off" toolbar. Listens for text selections inside any
 * [data-anchor-root] (document body or chat messages) and creates the branch
 * node + first message on action. Rendered in a body portal so canvas
 * transforms don't affect it.
 */
export function SelectionOverlay() {
  const [pending, setPending] = useState<ResolvedSelection | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const createBranch = useCanvasStore((s) => s.createBranch);

  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      if (e.target instanceof Element && e.target.closest('.selection-toolbar')) return;
      // Let the browser finalize the selection first.
      setTimeout(() => setPending(resolveSelection()), 0);
    }
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPending(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPending(null);
    }
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  async function act(action: QuickAction) {
    if (!pending) return;
    const { nodes } = useCanvasStore.getState();
    const parent = nodes.find((n) => n.id === pending.anchor.nodeId);
    if (!parent) return;

    const parentWidth = parent.kind === 'document' ? parent.width : BRANCH_WIDTH;
    const anchorFlowY = screenToFlowPosition({
      x: pending.rect.right,
      y: pending.rect.top,
    }).y;
    const pos = {
      x: parent.position.x + parentWidth + BRANCH_GAP,
      y: anchorFlowY - 24,
    };
    const siblings = nodes.filter(
      (n) => n.kind === 'branch' && n.parentNodeId === parent.id,
    );
    while (
      siblings.some(
        (s) =>
          Math.abs(s.position.x - pos.x) < BRANCH_WIDTH &&
          Math.abs(s.position.y - pos.y) < NUDGE - 40,
      )
    ) {
      pos.y += NUDGE;
    }

    const title = pending.anchor.quote.slice(0, 60);
    const firstMessage = action === 'ask' ? undefined : FIRST_MESSAGES[action];
    setPending(null);
    window.getSelection()?.removeAllRanges();
    await createBranch(parent.id, pending.anchor, title, pos, firstMessage);
  }

  if (!pending) return null;

  const left = Math.max(8, pending.rect.left + pending.rect.width / 2 - 110);
  const top = Math.max(8, pending.rect.top - 48);

  return createPortal(
    <div className="selection-toolbar" style={{ left, top }}>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => void act('explain')}>
        Explain
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => void act('context')}>
        More context
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => void act('ask')}>
        Ask…
      </button>
    </div>,
    document.body,
  );
}
