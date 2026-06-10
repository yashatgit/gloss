import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  useCanvasNavigation();
  const tidy = useTidy();
  useAutoTidy(tidy);

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
        // All wheel/pinch nav is handled by useCanvasNavigation (Figma-style:
        // scroll pans with momentum, pinch + ⌘/Ctrl-scroll zoom to the cursor).
        // RF only keeps left-drag-to-pan on empty canvas.
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag
        onNodeDragStop={(_, node) => persistPosition(node.id, node.position)}
      >
        <Background gap={32} color="rgba(130,125,120,0.18)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
        <FocusController />
        <CanvasPanel tidy={tidy} />
      </ReactFlow>
    </div>
  );
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;
const ZOOM_SENSITIVITY = 0.0016; // exp factor per wheel delta unit

/**
 * Figma-style canvas navigation, all on the wheel:
 *   • two-finger / wheel scroll → pan (1:1 with deltas, so trackpad momentum
 *     carries through like native scroll; Shift makes a vertical wheel pan
 *     horizontally)
 *   • pinch (ctrlKey wheel) and ⌘/Ctrl + scroll → zoom anchored at the cursor
 * `.nowheel` regions (node scroll areas) keep scrolling natively.
 */
function useCanvasNavigation() {
  const store = useStoreApi();
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const root = store.getState().domNode; // the .react-flow wrapper
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('.nowheel')) return; // native scroll inside nodes
      e.preventDefault();
      const vp = getViewport();

      // Pinch sends ctrlKey wheel; ⌘/Ctrl + scroll is an explicit zoom.
      if (e.ctrlKey || e.metaKey) {
        const rect = root.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const next = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, vp.zoom * Math.exp(-e.deltaY * ZOOM_SENSITIVITY)),
        );
        // Keep the flow point under the cursor fixed while zooming.
        const fx = (px - vp.x) / vp.zoom;
        const fy = (py - vp.y) / vp.zoom;
        setViewport({ x: px - fx * next, y: py - fy * next, zoom: next });
        return;
      }

      // Pan. Shift+vertical-wheel pans horizontally (mouse-wheel convenience).
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      setViewport({ x: vp.x - dx, y: vp.y - dy, zoom: vp.zoom });
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [store, getViewport, setViewport]);
}

/** Build a tidy callback that lays out using React Flow's MEASURED node sizes. */
function useTidy() {
  const applyPositions = useCanvasStore((s) => s.applyPositions);
  const { getNodes } = useReactFlow();
  return useCallback(() => {
    const domain = useCanvasStore.getState().nodes;
    if (domain.length <= 1) return;
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
  }, [applyPositions, getNodes]);
}

/** Auto-tidy on major changes (create/expand/collapse/delete/reply done). The
 *  store bumps tidyNonce for those; load/switch don't, so saved layouts stay.
 *  The delay lets the new/resized node get measured before we lay out. */
function useAutoTidy(tidy: () => void) {
  const nonce = useCanvasStore((s) => s.tidyNonce);
  const prev = useRef(nonce);
  useEffect(() => {
    if (nonce === prev.current) return;
    prev.current = nonce;
    const t = setTimeout(tidy, 160);
    return () => clearTimeout(t);
  }, [nonce, tidy]);
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

function CanvasPanel({ tidy }: { tidy: () => void }) {
  const docNodeId = useCanvasStore((s) => s.nodes.find((n) => n.kind === 'document')?.id);
  const flash = useCanvasStore((s) => s.flash);
  const { fitView } = useReactFlow();

  const focusDocument = () => {
    if (!docNodeId) return;
    void fitView({ nodes: [{ id: docNodeId }], duration: 350, maxZoom: 1, padding: 0.12 });
    flash(docNodeId);
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
