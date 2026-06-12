import { memo, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import { formatCost, type BranchNode } from '@gloss/shared';
import { useCanvasStore } from '../state/canvasStore';
import { branchCost } from '../state/cost';
import { Thread } from '../chat/Thread';
import { Composer } from '../chat/Composer';
import { AnchorHandles } from './AnchorHandles';
import {
  toHighlights,
  useAnchoredBranches,
  useFocusBranch,
} from './useAnchoredBranches';

export const BranchNodeView = memo(function BranchNodeView({ id }: NodeProps) {
  const branch = useCanvasStore(
    (s) => s.nodes.find((n) => n.id === id) as BranchNode | undefined,
  );
  const streamingText = useCanvasStore((s) => s.streaming[id] ?? null);
  const error = useCanvasStore((s) => s.errors[id]);
  const isCollapsed = useCanvasStore((s) => !!s.collapsed[id]);
  const isFlashing = useCanvasStore((s) => s.flashNodeId === id);
  const sendMessage = useCanvasStore((s) => s.sendMessage);
  const regenerate = useCanvasStore((s) => s.regenerate);
  const generateImage = useCanvasStore((s) => s.generateImage);
  const imageLoading = useCanvasStore((s) => !!s.imageLoading[id]);
  const imageEnabled = useCanvasStore((s) => s.configuredProviders.includes('openai'));
  const abortMessage = useCanvasStore((s) => s.abortMessage);
  const deleteBranch = useCanvasStore((s) => s.deleteBranch);
  const toggleCollapsed = useCanvasStore((s) => s.toggleCollapsed);
  const flash = useCanvasStore((s) => s.flash);
  const resizeBranchLocal = useCanvasStore((s) => s.resizeBranchLocal);
  const persistBranchSize = useCanvasStore((s) => s.persistBranchSize);
  const zoom = useStore((s) => s.transform[2]);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchored = useAnchoredBranches(id);
  const focusBranch = useFocusBranch();

  const highlightsFor = useCallback(
    (messageId: string) =>
      toHighlights(anchored.filter((b) => b.anchor?.messageId === messageId)),
    [anchored],
  );

  // Navigate to where this branch was anchored (zoom unchanged), pulse the span.
  const focusSource = useCallback(() => {
    if (!branch) return;
    focusBranch(branch.parentNodeId);
    flash(branch.parentNodeId);
    setTimeout(() => {
      const mark = document.querySelector(`mark[data-branch-id="${CSS.escape(id)}"]`);
      if (mark) {
        mark.classList.add('mark-flash');
        setTimeout(() => mark.classList.remove('mark-flash'), 1100);
      }
    }, 380);
  }, [branch, focusBranch, flash, id]);

  // Corner drag-resize. Deltas are screen px → divide by zoom for flow px.
  const onResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const z = zoom || 1;
      const startW = rect.width / z;
      const startH = rect.height / z;
      const sx = e.clientX;
      const sy = e.clientY;
      const onMove = (me: PointerEvent) => {
        const w = Math.max(300, Math.round(startW + (me.clientX - sx) / z));
        const h = Math.max(200, Math.round(startH + (me.clientY - sy) / z));
        resizeBranchLocal(id, w, h);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        persistBranchSize(id);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [id, zoom, resizeBranchLocal, persistBranchSize],
  );

  if (!branch) return null;
  const isDiscussion = !branch.anchor;
  const isStreaming = streamingText !== null;
  const busy = isStreaming || imageLoading;
  const cost = branchCost(branch);
  const style =
    isCollapsed
      ? { width: branch.width ?? 380 }
      : {
          width: branch.width ?? 380,
          // Generous default reading height; overridden once the user resizes.
          height: branch.height ?? 520,
          maxHeight: 'none' as const,
        };

  return (
    <div
      ref={containerRef}
      className={`branch-node${isCollapsed ? ' is-collapsed' : ''}${isFlashing ? ' is-flashing' : ''}`}
      style={style}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        isConnectable={false}
        className="anchor-handle"
      />
      <div className="node-drag-handle node-header">
        <span className="node-kind">{isDiscussion ? 'discussion' : 'branch'}</span>
        <button
          className="node-title node-title-btn"
          title={isDiscussion ? 'Back to document' : `Go to source: “${branch.anchor!.quote}”`}
          onClick={focusSource}
        >
          {isDiscussion ? 'Whole document' : `“${truncate(branch.anchor!.quote, 38)}”`}
        </button>
        {cost > 0 && (
          <span className="branch-cost" title="Estimated cost of this branch">
            {formatCost(cost)}
          </span>
        )}
        <button
          className="node-icon-btn"
          title={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={() => toggleCollapsed(id)}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
        <button
          className="node-icon-btn"
          title="Delete branch (and its sub-branches)"
          onClick={() => void deleteBranch(id)}
        >
          ×
        </button>
      </div>
      {!isCollapsed && (
        <>
          <Thread
            nodeId={id}
            messages={branch.messages}
            streamingText={streamingText}
            highlightsFor={highlightsFor}
            onMarkClick={focusBranch}
            scrollRef={scrollRef}
          />
          {error && (
            <div className="error-bar nodrag">
              <span>{error}</span>
              <button className="retry-btn" onClick={() => void regenerate(id)}>
                Retry
              </button>
            </div>
          )}
          {!error && !busy && branch.messages.at(-1)?.role === 'assistant' && (
            <button
              className="regenerate-btn nodrag"
              title="Regenerate the last reply"
              onClick={() => void regenerate(id)}
            >
              ↻ Regenerate
            </button>
          )}
          <Composer
            streaming={isStreaming}
            imageBusy={imageLoading}
            autoFocus={branch.messages.length === 0}
            placeholder={
              branch.messages.length > 0
                ? 'Ask a follow-up…'
                : isDiscussion
                  ? 'Ask about this document…'
                  : 'Ask about this selection…'
            }
            onSend={(text) => void sendMessage(id, text)}
            onStop={isStreaming ? () => abortMessage(id) : undefined}
            onImage={imageEnabled ? (text) => void generateImage(id, text) : undefined}
          />
        </>
      )}
      <AnchorHandles
        nodeId={id}
        containerRef={containerRef}
        scrollRef={scrollRef}
        branchIds={isCollapsed ? [] : anchored.map((b) => b.id)}
        version={anchored.length + branch.messages.length + (isCollapsed ? 1 : 0)}
      />
      {!isCollapsed && (
        <div
          className="resize-handle nodrag nowheel"
          title="Drag to resize"
          onPointerDown={onResizeStart}
        />
      )}
    </div>
  );
});

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
