import { useEffect } from 'react';
import {
  applyFontScale,
  applyTheme,
  FONT_MAX,
  FONT_MIN,
  useCanvasStore,
} from '../state/canvasStore';

/** Bottom-center glass bar: dark-mode toggle + reading font-size stepper. */
export function DisplayControls() {
  const theme = useCanvasStore((s) => s.theme);
  const fontScale = useCanvasStore((s) => s.fontScale);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const bumpFontScale = useCanvasStore((s) => s.bumpFontScale);

  // Apply persisted prefs to <html> on mount.
  useEffect(() => {
    applyTheme(theme);
    applyFontScale(fontScale);
  }, [theme, fontScale]);

  return (
    <div className="display-controls">
      <button
        className="dc-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      >
        {theme === 'dark' ? '☀︎' : '☾'}
      </button>
      <span className="dc-sep" />
      <button
        className="dc-btn"
        onClick={() => bumpFontScale(-1)}
        disabled={fontScale <= FONT_MIN + 1e-9}
        title="Smaller text"
      >
        <span style={{ fontSize: '0.85em' }}>A</span>
      </button>
      <span className="dc-readout">{Math.round(fontScale * 100)}%</span>
      <button
        className="dc-btn"
        onClick={() => bumpFontScale(1)}
        disabled={fontScale >= FONT_MAX - 1e-9}
        title="Larger text"
      >
        <span style={{ fontSize: '1.15em' }}>A</span>
      </button>
    </div>
  );
}
