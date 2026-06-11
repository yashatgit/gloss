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
        (n): n is BranchNode => n.kind === 'branch' && n.anchor.nodeId === nodeId,
      ),
    [nodes, nodeId],
  );
}

export function toHighlights(branches: BranchNode[]): HighlightSpec[] {
  return branches.map((b) => ({
    branchId: b.id,
    start: b.anchor.start,
    end: b.anchor.end,
    quote: b.anchor.quote,
  }));
}

/** Click on a highlight → glide the viewport to its branch node. */
export function useFocusBranch(): (branchId: string) => void {
  const { fitView } = useReactFlow();
  return useCallback(
    (branchId: string) => {
      void fitView({ nodes: [{ id: branchId }], duration: 350, maxZoom: 1, padding: 0.4 });
    },
    [fitView],
  );
}
