import { memo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useHighlights, type HighlightSpec } from './highlights';

interface Props {
  markdown: string;
  /** Identifies the anchor root for selection mapping. */
  nodeId?: string;
  messageId?: string;
  highlights?: HighlightSpec[];
  onMarkClick?: (branchId: string) => void;
}

const NO_HIGHLIGHTS: HighlightSpec[] = [];

export const MarkdownView = memo(function MarkdownView({
  markdown,
  nodeId,
  messageId,
  highlights,
  onMarkClick,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useHighlights(rootRef, highlights ?? NO_HIGHLIGHTS, markdown, onMarkClick);

  return (
    <div
      ref={rootRef}
      className="markdown-body"
      data-anchor-root=""
      data-node-id={nodeId}
      data-message-id={messageId}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
});
