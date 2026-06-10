import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { BranchNode as BranchNodeT } from '@reader/shared';
import { useCanvasStore } from '../state/canvasStore';
import { DocumentNodeView } from './DocumentNode';
import { BranchNodeView } from './BranchNode';
import { SelectionOverlay } from './SelectionOverlay';

// Must be module-level constants — a new object per render makes React Flow
// remount every node.
const nodeTypes = { document: DocumentNodeView, branch: BranchNodeView };

const defaultEdgeOptions = {
  style: { stroke: '#b4552d', strokeWidth: 1.5, opacity: 0.7 },
};

export function CanvasView() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
      <SelectionOverlay />
    </ReactFlowProvider>
  );
}

function CanvasInner() {
  const domainNodes = useCanvasStore((s) => s.nodes);
  const persistPosition = useCanvasStore((s) => s.persistPosition);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);

  // Sync domain → React Flow, preserving RF's own node objects (drag state,
  // measured dimensions) for nodes that already exist.
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return domainNodes.map((dn) => {
        const existing = prevById.get(dn.id);
        if (!existing) {
          return {
            id: dn.id,
            type: dn.kind,
            position: dn.position,
            data: {},
            dragHandle: '.node-drag-handle',
          };
        }
        // Propagate domain position changes — but never mid-drag, or the node
        // snaps back to the stale store position under the cursor.
        if (
          !existing.dragging &&
          (existing.position.x !== dn.position.x || existing.position.y !== dn.position.y)
        ) {
          return { ...existing, position: dn.position };
        }
        return existing;
      });
    });
  }, [domainNodes, setRfNodes]);

  // Edges are derived, never stored: anchor handle on the parent → branch.
  const edges = useMemo<Edge[]>(
    () =>
      domainNodes
        .filter((n): n is BranchNodeT => n.kind === 'branch')
        .map((b) => ({
          id: `e-${b.id}`,
          source: b.anchor.nodeId,
          sourceHandle: `anchor-${b.id}`,
          target: b.id,
          targetHandle: 'in',
        })),
    [domainNodes],
  );

  return (
    <div className="canvas-root">
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodeDragStop={(_, node) => persistPosition(node.id, node.position)}
      >
        <Background gap={28} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
