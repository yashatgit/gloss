import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { formatCost } from '@gloss/shared';
import { FONT_MAX, FONT_MIN, useCanvasStore } from '../state/canvasStore';
import { docCost } from '../state/cost';
import { SettingsModal } from './SettingsModal';

/**
 * Liquid Glass dock (bottom-center): always-visible canvas controls with a
 * macOS-style magnify-on-hover. Focus / Tidy / theme / font size / doc cost.
 */
export function Dock({ tidy }: { tidy: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cost = useCanvasStore((s) => docCost(s.nodes, s.doc));
  const theme = useCanvasStore((s) => s.theme);
  const fontScale = useCanvasStore((s) => s.fontScale);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const bumpFontScale = useCanvasStore((s) => s.bumpFontScale);
  const flash = useCanvasStore((s) => s.flash);
  const docNodeId = useCanvasStore((s) => s.nodes.find((n) => n.kind === 'document')?.id);
  const { fitView } = useReactFlow();

  const focusDocument = () => {
    if (!docNodeId) return;
    void fitView({ nodes: [{ id: docNodeId }], duration: 350, maxZoom: 1, padding: 0.12 });
    flash(docNodeId);
  };

  return (
    <div className="dock">
      <button onClick={focusDocument} title="Focus document">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
      <button onClick={tidy} title="Tidy layout">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
        </svg>
      </button>
      <button onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
        {theme === 'dark' ? '☀︎' : '☾'}
      </button>
      <span className="dock-sep" />
      <button
        onClick={() => bumpFontScale(-1)}
        disabled={fontScale <= FONT_MIN + 1e-9}
        title="Smaller text"
      >
        <span style={{ fontSize: '0.78em' }}>A</span>
      </button>
      <button
        onClick={() => bumpFontScale(1)}
        disabled={fontScale >= FONT_MAX - 1e-9}
        title={`Larger text (${Math.round(fontScale * 100)}%)`}
      >
        <span style={{ fontSize: '1.12em' }}>A</span>
      </button>
      <span className="dock-sep" />
      <button onClick={() => setSettingsOpen(true)} title="AI settings">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <span className="dock-cost" title="Estimated total for this document">
        {formatCost(cost)}
      </span>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
