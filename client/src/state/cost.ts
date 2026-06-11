import { costOfUsage, type BranchNode, type CanvasNode, type Doc } from '@reader/shared';

/** Estimated cost of one branch's conversation (token usage + flat image costs). */
export function branchCost(branch: BranchNode): number {
  return branch.messages.reduce(
    (sum, m) => sum + costOfUsage(m.model, m.usage) + (m.costUsd ?? 0),
    0,
  );
}

/** Estimated one-time cost of transcribing an image/PDF document. */
export function importCost(doc: Doc | null): number {
  return doc ? costOfUsage(doc.importModel, doc.importUsage) : 0;
}

/** Estimated total cost: every branch on the canvas + the doc's transcription. */
export function docCost(nodes: CanvasNode[], doc: Doc | null): number {
  const branches = nodes.reduce(
    (sum, n) => (n.kind === 'branch' ? sum + branchCost(n) : sum),
    0,
  );
  return branches + importCost(doc);
}
