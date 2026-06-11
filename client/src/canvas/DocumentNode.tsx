import { memo, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import { formatCost } from '@gloss/shared';
import { useCanvasStore } from '../state/canvasStore';
import { importCost } from '../state/cost';
import { MarkdownView } from '../reading/MarkdownView';
import { AnchorHandles } from './AnchorHandles';
import {
  toHighlights,
  useAnchoredBranches,
  useFocusBranch,
} from './useAnchoredBranches';

export const DocumentNodeView = memo(function DocumentNodeView({ id }: NodeProps) {
  const doc = useCanvasStore((s) => s.doc);
  const width = useCanvasStore((s) => {
    const n = s.nodes.find((n) => n.id === id);
    return n?.kind === 'document' ? n.width : 720;
  });
  const isFlashing = useCanvasStore((s) => s.flashNodeId === id);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchored = useAnchoredBranches(id);
  const focusBranch = useFocusBranch();

  if (!doc) return null;

  return (
    <div
      ref={containerRef}
      className={`doc-node${isFlashing ? ' is-flashing' : ''}`}
      style={{ width }}
    >
      <div className="node-drag-handle node-header">
        <span className="node-kind">document</span>
        <span className="node-title">{doc.title}</span>
        {doc.importUsage && (
          <span className="branch-cost" title="One-time cost to transcribe this file">
            {formatCost(importCost(doc))}
          </span>
        )}
      </div>
      {/* nowheel: wheel scrolls this pane, not the canvas zoom.
          nodrag: drag-select selects text instead of moving the node. */}
      <div ref={scrollRef} className="node-scroll nowheel nodrag">
        <MarkdownView
          markdown={doc.markdown}
          nodeId={id}
          highlights={toHighlights(anchored)}
          onMarkClick={focusBranch}
        />
      </div>
      <AnchorHandles
        nodeId={id}
        containerRef={containerRef}
        scrollRef={scrollRef}
        branchIds={anchored.map((b) => b.id)}
        version={anchored.length}
      />
    </div>
  );
});
