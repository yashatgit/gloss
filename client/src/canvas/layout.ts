import type { Position } from '@gloss/shared';

const COL_GAP = 120; // horizontal gap between depth columns
const ROW_GAP = 48; // vertical gap between nodes in a column

export interface LayoutNode {
  id: string;
  kind: 'document' | 'branch';
  parentNodeId?: string;
  /** Measured width/height from React Flow (falls back to estimates). */
  width: number;
  height: number;
}

/**
 * Column-by-depth tidy layout using MEASURED node sizes — depth 0 is the
 * document, each branch sits one column right of its parent. Column x is the
 * running sum of previous columns' widths (so a wide document never overlaps
 * the next column), and within a column nodes stack by their real heights (so
 * a tall conversation never overlaps the node below it).
 */
export function tidyPositions(nodes: LayoutNode[]): Record<string, Position> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (id: string): number => {
    let d = 0;
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && cur.kind === 'branch' && cur.parentNodeId && !seen.has(cur.id)) {
      seen.add(cur.id);
      d += 1;
      cur = byId.get(cur.parentNodeId);
    }
    return d;
  };

  const columns = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const d = depthOf(n.id);
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(n);
  }

  const depths = [...columns.keys()].sort((a, b) => a - b);

  // x offset per column = sum of prior columns' max widths + gaps.
  const colX = new Map<number, number>();
  let x = 0;
  for (const d of depths) {
    colX.set(d, x);
    const maxW = Math.max(...columns.get(d)!.map((n) => n.width));
    x += maxW + COL_GAP;
  }

  const positions: Record<string, Position> = {};
  for (const d of depths) {
    let y = 0;
    for (const n of columns.get(d)!) {
      positions[n.id] = { x: colX.get(d)!, y };
      y += n.height + ROW_GAP;
    }
  }
  return positions;
}
