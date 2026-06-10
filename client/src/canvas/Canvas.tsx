import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { BranchNode as BranchNodeT } from '@reader/shared';
import { useCanvasStore } from '../state/canvasStore';
import { tidyPositions, type LayoutNode } from './layout';
import { DocumentNodeView } from './DocumentNode';
import { BranchNodeView } from './BranchNode';
import { SelectionOverlay } from './SelectionOverlay';

// Must be module-level constants — a new object per render makes React Flow
// remount every node.
const nodeTypes = { document: DocumentNodeView, branch: BranchNodeView };

// Edge color is themed in CSS (.react-flow__edge-path) so light/dark both work.
const defaultEdgeOptions = {
  style: { strokeWidth: 2, opacity: 0.55 },
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
  useNativeScrollPan();

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
        // Wheel panning is handled by useNativeScrollPan (1:1 with raw deltas,
        // so trackpad momentum feels like native page scroll). RF only owns
        // pinch-zoom and drag-pan here.
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag
        onNodeDragStop={(_, node) => persistPosition(node.id, node.position)}
      >
        <Background gap={32} color="rgba(130,125,120,0.18)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
        <FocusController />
        <CanvasPanel />
      </ReactFlow>
    </div>
  );
}

/**
 * Native-feeling wheel/trackpad panning: pans the viewport 1:1 with raw wheel
 * deltas so the OS's momentum-phase events carry through exactly like scrolling
 * a webpage. Leaves pinch-zoom (ctrl/meta + wheel) to React Flow, and lets
 * `.nowheel` regions (node scroll areas) scroll natively.
 */
function useNativeScrollPan() {
  const store = useStoreApi();
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const root = store.getState().domNode; // the .react-flow wrapper
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // pinch-zoom → React Flow
      const target = e.target as Element | null;
      if (target?.closest('.nowheel')) return; // native scroll inside nodes
      e.preventDefault();
      const vp = getViewport();
      // Subtract deltas: content follows the gesture, in screen space (so the
      // feel is identical regardless of zoom level).
      setViewport({ x: vp.x - e.deltaX, y: vp.y - e.deltaY, zoom: vp.zoom });
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [store, getViewport, setViewport]);
}

/** Glides the viewport to the node the store asks to focus (new branch / request). */
function FocusController() {
  const focusTarget = useCanvasStore((s) => s.focusTarget);
  const clearFocus = useCanvasStore((s) => s.clearFocus);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!focusTarget) return;
    // Let the node mount/measure first so fitView frames it correctly.
    const t = setTimeout(() => {
      void fitView({ nodes: [{ id: focusTarget }], duration: 400, maxZoom: 1, padding: 0.3 });
      clearFocus();
    }, 60);
    return () => clearTimeout(t);
  }, [focusTarget, fitView, clearFocus]);

  return null;
}

function CanvasPanel() {
  const docNodeId = useCanvasStore((s) => s.nodes.find((n) => n.kind === 'document')?.id);
  const flash = useCanvasStore((s) => s.flash);
  const applyPositions = useCanvasStore((s) => s.applyPositions);
  const { fitView, getNodes } = useReactFlow();

  const focusDocument = () => {
    if (!docNodeId) return;
    void fitView({ nodes: [{ id: docNodeId }], duration: 350, maxZoom: 1, padding: 0.12 });
    flash(docNodeId);
  };

  // Tidy using MEASURED node sizes so neither columns nor rows overlap.
  const tidy = () => {
    const domain = useCanvasStore.getState().nodes;
    const sizeById = new Map(getNodes().map((n) => [n.id, n.measured]));
    const layoutNodes: LayoutNode[] = domain.map((n) => {
      const m = sizeById.get(n.id);
      return {
        id: n.id,
        kind: n.kind,
        parentNodeId: n.kind === 'branch' ? n.parentNodeId : undefined,
        width: m?.width ?? (n.kind === 'document' ? 720 : 380),
        height: m?.height ?? (n.kind === 'document' ? 620 : 360),
      };
    });
    applyPositions(tidyPositions(layoutNodes));
  };

  return (
    <Panel position="top-left" className="canvas-panel">
      <button onClick={focusDocument} title="Center and zoom to the document">
        Focus document
      </button>
      <button onClick={tidy} title="Auto-arrange branches by depth">
        Tidy layout
      </button>
    </Panel>
  );
}
