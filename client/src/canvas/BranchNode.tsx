import { memo, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { BranchNode } from '@reader/shared';
import { useCanvasStore } from '../state/canvasStore';
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
  const sendMessage = useCanvasStore((s) => s.sendMessage);
  const abortMessage = useCanvasStore((s) => s.abortMessage);
  const deleteBranch = useCanvasStore((s) => s.deleteBranch);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchored = useAnchoredBranches(id);
  const focusBranch = useFocusBranch();

  const highlightsFor = useCallback(
    (messageId: string) =>
      toHighlights(anchored.filter((b) => b.anchor.messageId === messageId)),
    [anchored],
  );

  if (!branch) return null;
  const isStreaming = streamingText !== null;

  return (
    <div ref={containerRef} className="branch-node">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        isConnectable={false}
        className="anchor-handle"
      />
      <div className="node-drag-handle node-header">
        <span className="node-kind">branch</span>
        <span className="node-title" title={branch.anchor.quote}>
          “{truncate(branch.anchor.quote, 48)}”
        </span>
        <button
          className="node-close"
          title="Delete branch (and its sub-branches)"
          onClick={() => void deleteBranch(id)}
        >
          ×
        </button>
      </div>
      <Thread
        nodeId={id}
        messages={branch.messages}
        streamingText={streamingText}
        highlightsFor={highlightsFor}
        onMarkClick={focusBranch}
        scrollRef={scrollRef}
      />
      {error && <div className="error-bar nodrag">{error}</div>}
      <Composer
        disabled={isStreaming}
        autoFocus={branch.messages.length === 0}
        placeholder={
          branch.messages.length === 0 ? 'Ask about this selection…' : 'Ask a follow-up…'
        }
        onSend={(text) => void sendMessage(id, text)}
        onStop={() => abortMessage(id)}
      />
      <AnchorHandles
        nodeId={id}
        containerRef={containerRef}
        scrollRef={scrollRef}
        branchIds={anchored.map((b) => b.id)}
        version={anchored.length + branch.messages.length}
      />
    </div>
  );
});

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
