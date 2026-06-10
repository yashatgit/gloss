import { costOfUsage, type BranchNode, type CanvasNode } from '@reader/shared';

/** Estimated cost of one branch's conversation (sums assistant-message usage). */
export function branchCost(branch: BranchNode): number {
  return branch.messages.reduce((sum, m) => sum + costOfUsage(m.model, m.usage), 0);
}

/** Estimated cost across every branch on the canvas. */
export function docCost(nodes: CanvasNode[]): number {
  return nodes.reduce(
    (sum, n) => (n.kind === 'branch' ? sum + branchCost(n) : sum),
    0,
  );
}
