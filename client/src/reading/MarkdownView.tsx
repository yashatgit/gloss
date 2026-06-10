import { memo, useRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
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

/** Flatten a React children tree to its raw text. */
function nodeText(node: ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

/**
 * Confluence-style code block: light panel + a line-number gutter. Numbers are
 * CSS counters (::before), so they're not real text — they stay out of text
 * selection, copy, and the anchor-offset mapping.
 */
function CodeBlock({ raw }: { raw: string }) {
  const lines = raw.replace(/\n+$/, '').split('\n');
  return (
    <div className="cf-codeblock">
      <pre className="cf-pre">
        <code>
          {lines.map((line, i) => (
            <span className="cf-line" key={i}>
              {line === '' ? ' ' : line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

// Module-level so the object identity is stable across renders.
const mdComponents: Components = {
  // Block code is fully rendered here from raw text (the inner <code> is ignored).
  pre: ({ children }) => <CodeBlock raw={nodeText(children)} />,
  // Only inline code reaches this (block code is handled by `pre`).
  code: ({ children }) => <code className="cf-inline">{children}</code>,
  // Wrap tables so wide ones scroll horizontally instead of overflowing the node.
  table: ({ children }) => (
    <div className="cf-table-wrap nowheel">
      <table>{children}</table>
    </div>
  ),
};

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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
});
