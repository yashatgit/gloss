import { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { formatCost } from '@gloss/shared';
import { FONT_MAX, FONT_MIN, useCanvasStore } from '../state/canvasStore';
import { docCost } from '../state/cost';
import { ModelPicker } from './ModelPicker';

/**
 * Single floating action button that pops up a glass menu with all the canvas
 * controls — cost, model, focus, tidy, theme, font size — so they're not
 * scattered around the screen. Spring-in with staggered items.
 */
export function FloatingMenu({ tidy }: { tidy: () => void }) {
  const [open, setOpen] = useState(false);

  const cost = useCanvasStore((s) => docCost(s.nodes, s.doc));
  const theme = useCanvasStore((s) => s.theme);
  const fontScale = useCanvasStore((s) => s.fontScale);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const bumpFontScale = useCanvasStore((s) => s.bumpFontScale);
  const flash = useCanvasStore((s) => s.flash);
  const docNodeId = useCanvasStore((s) => s.nodes.find((n) => n.kind === 'document')?.id);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const focusDocument = () => {
    if (!docNodeId) return;
    void fitView({ nodes: [{ id: docNodeId }], duration: 350, maxZoom: 1, padding: 0.12 });
    flash(docNodeId);
    setOpen(false);
  };

  return (
    <div className="fab-wrap">
      {open && <div className="fab-overlay" onClick={() => setOpen(false)} />}

      <div className={`fab-menu${open ? ' open' : ''}`}>
        <div className="fab-item fab-row cost">
          <span className="fab-cost-label">This document</span>
          <span className="fab-cost-value">{formatCost(cost)}</span>
        </div>
        <div className="fab-item fab-row">
          <ModelPicker />
        </div>
        <div className="fab-sep" />
        <button className="fab-item fab-action" onClick={focusDocument}>
          <span className="fab-ic">⌖</span> Focus document
        </button>
        <button
          className="fab-item fab-action"
          onClick={() => {
            tidy();
            setOpen(false);
          }}
        >
          <span className="fab-ic">⊞</span> Tidy layout
        </button>
        <div className="fab-sep" />
        <div className="fab-item fab-row appearance">
          <button
            className="fab-pill"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀︎ Light' : '☾ Dark'}
          </button>
          <div className="fab-font">
            <button
              onClick={() => bumpFontScale(-1)}
              disabled={fontScale <= FONT_MIN + 1e-9}
              title="Smaller text"
            >
              <span style={{ fontSize: '0.8em' }}>A</span>
            </button>
            <span className="fab-font-readout">{Math.round(fontScale * 100)}%</span>
            <button
              onClick={() => bumpFontScale(1)}
              disabled={fontScale >= FONT_MAX - 1e-9}
              title="Larger text"
            >
              <span style={{ fontSize: '1.15em' }}>A</span>
            </button>
          </div>
        </div>
      </div>

      <button
        className={`fab${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Controls"
        aria-label="Controls"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="8" x2="20" y2="8" />
          <circle cx="9" cy="8" r="2.4" fill="var(--glass-strong)" />
          <line x1="4" y1="16" x2="20" y2="16" />
          <circle cx="15" cy="16" r="2.4" fill="var(--glass-strong)" />
        </svg>
      </button>
    </div>
  );
}
