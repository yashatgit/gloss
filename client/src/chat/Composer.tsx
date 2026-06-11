import { useState } from 'react';

interface Props {
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  /** When set (and disabled), shows a Stop button that aborts the stream. */
  onStop?: () => void;
  /** When set, shows an "illustrate" button that generates an image from the text. */
  onImage?: (text: string) => void;
  autoFocus?: boolean;
}

export function Composer({ disabled, placeholder, onSend, onStop, onImage, autoFocus }: Props) {
  const [text, setText] = useState('');

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    onSend(trimmed);
  }

  function image() {
    const trimmed = text.trim();
    if (!trimmed || disabled || !onImage) return;
    setText('');
    onImage(trimmed);
  }

  return (
    <div className="composer">
      <textarea
        className="nodrag nowheel"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Ask a follow-up…'}
        disabled={disabled}
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
          disabled={disabled || !text.trim()}
          title="Generate an image to illustrate this"
        >
          🖼
        </button>
      )}
      {disabled && onStop ? (
        <button className="stop-button" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button onClick={submit} disabled={disabled || !text.trim()}>
          Send
        </button>
      )}
    </div>
  );
}
