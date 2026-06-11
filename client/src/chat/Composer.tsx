import { useState } from 'react';

interface Props {
  /** A text reply is currently streaming (Send becomes Stop). */
  streaming?: boolean;
  /** An image is generating (locks input + buttons). */
  imageBusy?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** When set, shows an image button that generates an image from the text. */
  onImage?: (text: string) => void;
  autoFocus?: boolean;
}

export function Composer({
  streaming,
  imageBusy,
  placeholder,
  onSend,
  onStop,
  onImage,
  autoFocus,
}: Props) {
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  function submit() {
    if (!hasText || streaming || imageBusy) return;
    onSend(text.trim());
    setText('');
  }

  function image() {
    if (!hasText || imageBusy || !onImage) return;
    onImage(text.trim());
    setText('');
  }

  return (
    <div className="composer">
      <textarea
        className="nodrag nowheel"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Ask a follow-up…'}
        disabled={imageBusy}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {onImage && (
        <button
          className="image-button"
          onClick={image}
          // Independent of text streaming — only blocked by an in-flight image.
          disabled={imageBusy || !hasText}
          title="Generate an image to illustrate this"
          aria-label="Generate image"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="8.5" cy="9.5" r="1.6" />
            <path d="M21 16l-5-5L5 20" />
          </svg>
        </button>
      )}
      {streaming && onStop ? (
        <button className="stop-button" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button onClick={submit} disabled={!hasText || streaming || imageBusy}>
          Send
        </button>
      )}
    </div>
  );
}
