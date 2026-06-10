import { useEffect } from 'react';
import { useCanvasStore } from './state/canvasStore';

// Hash routing (`#/d/<docId>`) — gives each document a unique, shareable URL
// and works without server SPA-fallback config (and later in Electron/file://).
const DOC_RE = /^#\/d\/([\w-]+)/;

export function docIdFromHash(): string | null {
  const m = window.location.hash.match(DOC_RE);
  return m ? m[1]! : null;
}

export function navigateToDoc(id: string): void {
  window.location.hash = `#/d/${id}`;
}

export function navigateHome(): void {
  window.location.hash = '#/';
}

/**
 * Single source of truth: the URL hash drives which document is open. Mounted
 * once in App. Navigation elsewhere just sets the hash; this reconciles it to
 * store state (load on deep-link/forward/back, reset when cleared).
 */
export function useDocumentRouting(): void {
  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  const reset = useCanvasStore((s) => s.reset);

  useEffect(() => {
    const sync = () => {
      const urlId = docIdFromHash();
      const cur = useCanvasStore.getState().doc?.id ?? null;
      if (urlId && urlId !== cur) {
        void loadCanvas(urlId).catch(() => navigateHome());
      } else if (!urlId && cur) {
        reset();
      }
    };
    window.addEventListener('hashchange', sync);
    sync(); // honor a deep link on first load
    return () => window.removeEventListener('hashchange', sync);
  }, [loadCanvas, reset]);
}
