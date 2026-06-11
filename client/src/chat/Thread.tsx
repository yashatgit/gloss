import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { costOfUsage, formatCost, getModel, type ChatMessage } from '@gloss/shared';
import { assetUrl } from '../api/client';
import { useCanvasStore } from '../state/canvasStore';
import { MarkdownView } from '../reading/MarkdownView';
import type { HighlightSpec } from '../reading/highlights';

interface Props {
  nodeId: string;
  messages: ChatMessage[];
  /** Live assistant text while streaming (null when idle). */
  streamingText: string | null;
  highlightsFor?: (messageId: string) => HighlightSpec[];
  onMarkClick?: (branchId: string) => void;
  /** Exposes the scrollable element (for anchor-handle re-measuring). */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function Thread({
  nodeId,
  messages,
  streamingText,
  highlightsFor,
  onMarkClick,
  scrollRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(scrollRef, () => containerRef.current as HTMLDivElement, []);
  const docId = useCanvasStore((s) => s.doc?.id);
  const imageLoading = useCanvasStore((s) => !!s.imageLoading[nodeId]);

  // Throttle to one scroll per frame — deltas arrive far faster than 60Hz.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length, streamingText, imageLoading]);

  return (
    <div ref={containerRef} className="thread nowheel nodrag">
      {messages.map((m) => (
        <div key={m.id} className={`msg msg-${m.role}`}>
          {m.role !== 'assistant' ? (
            <p>{m.text}</p>
          ) : m.imagePath ? (
            <figure className="msg-image">
              {docId && <img src={assetUrl(docId, m.imagePath)} alt={m.text} loading="lazy" />}
              {m.text && <figcaption>{m.text}</figcaption>}
            </figure>
          ) : (
            <MarkdownView
              markdown={m.text}
              nodeId={nodeId}
              messageId={m.id}
              highlights={highlightsFor?.(m.id)}
              onMarkClick={onMarkClick}
            />
          )}
          {(m.usage || m.costUsd != null) && (
            <div className="usage-badge" title="model · usage · est. cost">
              {getModel(m.model ?? '')?.label ?? m.model ?? '?'}
              {m.usage && (
                <>
                  {' · '}
                  {m.usage.input_tokens}→{m.usage.output_tokens} tok
                  {m.usage.cache_read_input_tokens > 0 &&
                    ` · ⚡${m.usage.cache_read_input_tokens} cached`}
                </>
              )}
              {m.imagePath && ' · 🖼'}
              {' · '}
              {formatCost((m.costUsd ?? 0) + costOfUsage(m.model, m.usage))}
            </div>
          )}
        </div>
      ))}
      {imageLoading && (
        <div className="msg msg-assistant image-loading">
          <span className="img-shimmer" />
          <span className="img-loading-label">Generating image…</span>
        </div>
      )}
      {streamingText !== null &&
        (streamingText === '' ? (
          <div className="msg msg-assistant thinking-indicator" aria-label="Thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        ) : (
          <div className="msg msg-assistant msg-streaming">
            <MarkdownView markdown={streamingText} nodeId={nodeId} />
            <span className="stream-cursor" />
          </div>
        ))}
    </div>
  );
}
