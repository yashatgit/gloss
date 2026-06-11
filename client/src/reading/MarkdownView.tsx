import { memo, useRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/common';
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Syntax-highlight code, then split the highlighted HTML into per-line strings,
 * re-opening any highlight.js spans that straddle a newline. Each line lives in
 * its own element (for the CSS-counter gutter) while highlighting stays correct
 * across multi-line tokens.
 */
function highlightToLines(raw: string, lang?: string): string[] {
  let html: string;
  try {
    html =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(raw).value;
  } catch {
    html = escapeHtml(raw);
  }

  const lines: string[] = [''];
  const stack: string[] = [];
  const append = (s: string) => (lines[lines.length - 1] += s);
  const tokenRe = /<span [^>]*>|<\/span>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html))) {
    const tok = m[0];
    if (tok.startsWith('<span')) {
      stack.push(tok);
      append(tok);
    } else if (tok === '</span>') {
      stack.pop();
      append(tok);
    } else {
      const parts = tok.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) {
          for (let j = 0; j < stack.length; j++) append('</span>');
          lines.push('');
          for (const open of stack) append(open);
        }
        append(part);
      });
    }
  }
  return lines;
}

/**
 * Confluence-style code block: light panel + line-number gutter, with
 * highlight.js syntax colors. Line numbers are CSS counters (::before), so they
 * stay out of text selection, copy, and the anchor-offset mapping.
 */
function CodeBlock({ raw, lang }: { raw: string; lang?: string }) {
  const lines = highlightToLines(raw.replace(/\n+$/, ''), lang);
  return (
    <div className="cf-codeblock hljs">
      <pre className="cf-pre">
        <code>
          {lines.map((line, i) => (
            <span
              className="cf-line"
              key={i}
              dangerouslySetInnerHTML={{ __html: line === '' ? ' ' : line }}
            />
          ))}
        </code>
      </pre>
    </div>
  );
}

function langOf(className?: string): string | undefined {
  return /language-(\w+)/.exec(className ?? '')?.[1];
}

// Module-level so the object identity is stable across renders.
const mdComponents: Components = {
  // Unwrap <pre>; the inner code component renders the styled block.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = nodeText(children);
    const lang = langOf(className);
    // Fenced block = has a language class or spans multiple lines; else inline.
    if (lang || text.includes('\n')) return <CodeBlock raw={text} lang={lang} />;
    return <code className="cf-inline">{children}</code>;
  },
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
