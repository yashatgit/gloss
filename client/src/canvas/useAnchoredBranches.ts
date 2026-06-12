import { useCallback, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { BranchNode } from '@gloss/shared';
import { useCanvasStore } from '../state/canvasStore';
import type { HighlightSpec } from '../reading/highlights';

/** Branches anchored anywhere inside the given node. */
export function useAnchoredBranches(nodeId: string): BranchNode[] {
  const nodes = useCanvasStore((s) => s.nodes);
  return useMemo(
    () =>
      nodes.filter(
        (n): n is BranchNode => n.kind === 'branch' && n.anchor?.nodeId === nodeId,
      ),
    [nodes, nodeId],
  );
}

export function toHighlights(branches: BranchNode[]): HighlightSpec[] {
  return branches
    .filter((b): b is BranchNode & { anchor: NonNullable<BranchNode['anchor']> } => !!b.anchor)
    .map((b) => ({
      branchId: b.id,
      start: b.anchor.start,
      end: b.anchor.end,
      quote: b.anchor.quote,
    }));
}

/**
 * Glide the viewport to center a node WITHOUT changing zoom — the user's zoom
 * level is theirs; focusing (highlight click, new branch, focus document) only
 * pans to the node's center at the current zoom.
 */
export function useFocusBranch(): (nodeId: string) => void {
  const rf = useReactFlow();
  return useCallback(
    (nodeId: string) => {
      const node = rf.getNode(nodeId);
      if (!node) return;
      const w = node.measured?.width ?? 400;
      const h = node.measured?.height ?? 400;
      void rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: rf.getViewport().zoom,
        duration: 400,
      });
    },
    [rf],
  );
}
