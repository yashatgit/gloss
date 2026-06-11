import { useState } from 'react';
import { useDictation } from './useDictation';

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
  const dictation = useDictation((t) => setText((prev) => (prev ? `${prev} ${t}` : t)));

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
    <div className={`composer${dictation.listening ? ' listening' : ''}`}>
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
      {dictation.supported && (
        <button
          className={`mic-button${dictation.listening ? ' listening' : ''}`}
          onClick={dictation.toggle}
          disabled={imageBusy}
          title={dictation.listening ? 'Stop dictation' : 'Dictate with your voice'}
          aria-label="Dictate"
        >
          {dictation.listening ? (
            <span className="eq" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </span>
          ) : (
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
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
          )}
        </button>
      )}
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
        <button className="stop-button" onClick={onStop} title="Stop" aria-label="Stop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2.5" />
          </svg>
        </button>
      ) : (
        <button
          className="send-button"
          onClick={submit}
          disabled={!hasText || streaming || imageBusy}
          title="Send"
          aria-label="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
