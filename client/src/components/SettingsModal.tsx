import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  formatCost,
  imageCost,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  type ImageQuality,
  type ImageSize,
} from '@gloss/shared';
import { useCanvasStore } from '../state/canvasStore';
import { ModelPicker } from './ModelPicker';

/** Dedicated AI settings: pick text + image models and their configs. */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const imageModel = useCanvasStore((s) => s.imageModel);
  const imageQuality = useCanvasStore((s) => s.imageQuality);
  const imageSize = useCanvasStore((s) => s.imageSize);
  const setImageConfig = useCanvasStore((s) => s.setImageConfig);
  const openaiConfigured = useCanvasStore((s) => s.configuredProviders.includes('openai'));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
