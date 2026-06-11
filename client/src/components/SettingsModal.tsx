import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatCost,
  imageCost,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  type ImageQuality,
  type ImageSize,
  type Provider,
} from '@gloss/shared';
import { useCanvasStore } from '../state/canvasStore';
import { ModelPicker } from './ModelPicker';

/** Dedicated AI settings: API keys (BYOK) + text/image model configs. */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const imageModel = useCanvasStore((s) => s.imageModel);
  const imageQuality = useCanvasStore((s) => s.imageQuality);
  const imageSize = useCanvasStore((s) => s.imageSize);
  const setImageConfig = useCanvasStore((s) => s.setImageConfig);
  const openaiConfigured = useCanvasStore((s) => s.configuredProviders.includes('openai'));
  const loadKeys = useCanvasStore((s) => s.loadKeys);

  useEffect(() => {
    if (!open) return;
    void loadKeys();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, loadKeys]);

  if (!open) return null;

  const perImage = imageCost(imageModel, imageQuality, imageSize);

  return createPortal(
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>AI settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <section className="settings-section">
          <label className="settings-label">API keys</label>
          <KeyRow provider="anthropic" name="Anthropic (Claude)" placeholder="sk-ant-…" />
          <KeyRow provider="openai" name="OpenAI (ChatGPT)" placeholder="sk-…" />
          <p className="settings-hint">
            Stored locally on this device; sent only to the provider. Overrides any
            <code> .env</code> key.
          </p>
        </section>

        <section className="settings-section">
          <label className="settings-label">Text model</label>
          <ModelPicker />
          <p className="settings-hint">Used for branch conversations.</p>
        </section>

        <section className="settings-section">
          <label className="settings-label">
            Image model {!openaiConfigured && <span className="settings-warn">— needs OpenAI key</span>}
          </label>
          <div className="settings-grid">
            <select
              value={imageModel}
              onChange={(e) => setImageConfig({ model: e.target.value })}
              disabled={!openaiConfigured}
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={imageQuality}
              onChange={(e) => setImageConfig({ quality: e.target.value as ImageQuality })}
              disabled={!openaiConfigured}
            >
              {IMAGE_QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q[0]!.toUpperCase() + q.slice(1)} quality
                </option>
              ))}
            </select>
            <select
              value={imageSize}
              onChange={(e) => setImageConfig({ size: e.target.value as ImageSize })}
              disabled={!openaiConfigured}
            >
              {IMAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('x', ' × ')}
                </option>
              ))}
            </select>
          </div>
          <p className="settings-hint">
            Used for the 🖼 illustrate button · <strong>{formatCost(perImage)}</strong> per image
          </p>
        </section>
      </div>
    </div>,
    document.body,
  );
}

/** One BYOK key field: status pill + masked input + save/clear. */
function KeyRow({
  provider,
  name,
  placeholder,
}: {
  provider: Provider;
  name: string;
  placeholder: string;
}) {
  const status = useCanvasStore((s) => s.keysStatus?.[provider]);
  const saveKeys = useCanvasStore((s) => s.saveKeys);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const set = status?.set;
  const source = status?.source;

  async function save(next: string | null) {
    setBusy(true);
    try {
      await saveKeys({ [provider]: next } as Partial<Record<Provider, string | null>>);
      setValue('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="key-row">
      <div className="key-row-head">
        <span className="key-name">{name}</span>
        <span className={`key-status${set ? ' on' : ''}`}>
          {set ? (source === 'env' ? 'Set · .env' : 'Set') : 'Not set'}
        </span>
      </div>
      <div className="key-row-input">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={set ? '•••••••••• (saved)' : placeholder}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) void save(value.trim());
          }}
        />
        <button
          className="key-save"
          disabled={busy || !value.trim()}
          onClick={() => void save(value.trim())}
        >
          Save
        </button>
        {set && source === 'stored' && (
          <button className="key-clear" disabled={busy} onClick={() => void save(null)} title="Remove key">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
