import type { CanvasNode, Position } from '@reader/shared';

const COL_X = 560; // horizontal step per depth level
const ROW_GAP = 40;
const DOC_HEIGHT = 620;
const BRANCH_HEIGHT = 360;
const COLLAPSED_HEIGHT = 52;

/**
 * Deterministic column-by-depth layout: depth 0 is the document, each branch
 * sits one column right of its parent, stacked top-to-bottom within its column
 * with no overlap. Returns new positions keyed by node id.
 */
export function tidyPositions(
  nodes: CanvasNode[],
  collapsed: Record<string, boolean>,
): Record<string, Position> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (id: string): number => {
    let d = 0;
    let cur = byId.get(id);
    while (cur && cur.kind === 'branch') {
      d += 1;
      cur = byId.get(cur.parentNodeId);
    }
    return d;
  };

  // Group by depth, preserving creation order.
  const columns = new Map<number, CanvasNode[]>();
  for (const n of nodes) {
    const d = depthOf(n.id);
    (columns.get(d) ?? columns.set(d, []).get(d)!).push(n);
  }

  const positions: Record<string, Position> = {};
  for (const [depth, colNodes] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    let y = 0;
    for (const n of colNodes) {
      positions[n.id] = { x: depth * COL_X, y };
      const h =
        n.kind === 'document'
          ? DOC_HEIGHT
          : collapsed[n.id]
            ? COLLAPSED_HEIGHT
            : BRANCH_HEIGHT;
      y += h + ROW_GAP;
    }
  }
  return positions;
}

/** Place a brand-new branch near its anchor, nudging clear of siblings. */
export function placeNewBranch(
  nodes: CanvasNode[],
  parentNodeId: string,
  anchorScreenY: number,
): Position {
  const parent = nodes.find((n) => n.id === parentNodeId);
  if (!parent) return { x: 0, y: anchorScreenY };
  const parentWidth = parent.kind === 'document' ? parent.width : 380;
  const pos = { x: parent.position.x + parentWidth + 120, y: anchorScreenY };

  const siblings = nodes.filter(
    (n) => n.kind === 'branch' && n.parentNodeId === parentNodeId,
  );
  while (
    siblings.some(
      (s) => Math.abs(s.position.x - pos.x) < 380 && Math.abs(s.position.y - pos.y) < BRANCH_HEIGHT,
    )
  ) {
    pos.y += BRANCH_HEIGHT + ROW_GAP;
  }
  return pos;
}
