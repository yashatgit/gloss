import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react';
import { Handle, Position, useStore, useUpdateNodeInternals } from '@xyflow/react';

interface Props {
  nodeId: string;
  /** The node's root element — handle y-positions are relative to it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The inner scrollable element — re-measure on its scroll. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Branches anchored in this node (handle id = `anchor-${branchId}`). */
  branchIds: string[];
  /** Bump to re-measure (e.g. when messages/highlights change). */
  version: number;
}

const HEADER_CLEARANCE = 40;
const BOTTOM_CLEARANCE = 16;
const FALLBACK_Y = 60;

/**
 * An "anchor rail" along the node's right edge: one source handle per branch,
 * vertically tracking its highlight <mark> (clamped to the node bounds while
 * the mark is scrolled out of view). Edges therefore originate at the
 * selected span and follow it as the node's content scrolls.
 */
export function AnchorHandles({
  nodeId,
  containerRef,
  scrollRef,
  branchIds,
  version,
}: Props) {
  const [ys, setYs] = useState<Record<string, number>>({});
  const zoom = useStore((s) => s.transform[2]);
  const updateNodeInternals = useUpdateNodeInternals();

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const crect = container.getBoundingClientRect();
    const height = crect.height / zoom;
    const next: Record<string, number> = {};
    for (const id of branchIds) {
      const mark = container.querySelector(`mark[data-branch-id="${CSS.escape(id)}"]`);
      if (mark) {
        const mrect = mark.getBoundingClientRect();
        const y = (mrect.top - crect.top + mrect.height / 2) / zoom;
        next[id] = Math.min(Math.max(y, HEADER_CLEARANCE), height - BOTTOM_CLEARANCE);
      } else {
        next[id] = FALLBACK_Y;
      }
    }
    setYs((prev) => (shallowEq(prev, next) ? prev : next));
  }, [branchIds, containerRef, zoom]);

  useLayoutEffect(() => {
    measure();
  }, [measure, version]);

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [ys, nodeId, updateNodeInternals]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [measure, scrollRef]);

  return (
    <>
      {branchIds.map((id) => (
        <Handle
          key={id}
          type="source"
          position={Position.Right}
          id={`anchor-${id}`}
          isConnectable={false}
          className="anchor-handle"
          style={{ top: ys[id] ?? FALLBACK_Y }}
        />
      ))}
    </>
  );
}

function shallowEq(a: Record<string, number>, b: Record<string, number>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}
