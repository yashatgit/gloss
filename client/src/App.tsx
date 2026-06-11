import { useEffect, useRef, useState } from 'react';
import { formatCost, type DocumentSummary } from '@gloss/shared';
import * as api from './api/client';
import { encodeImage, fileToBase64 } from './api/image';
import { applyFontScale, applyTheme, useCanvasStore } from './state/canvasStore';
import { CanvasView } from './canvas/Canvas';
import { ModelPicker } from './components/ModelPicker';
import { navigateHome, navigateToDoc, useDocumentRouting } from './routing';

export default function App() {
  const hasDoc = useCanvasStore((s) => s.doc !== null);
  const loadConfig = useCanvasStore((s) => s.loadConfig);
  const theme = useCanvasStore((s) => s.theme);
  const fontScale = useCanvasStore((s) => s.fontScale);
  useDocumentRouting();

  useEffect(() => {
    void loadConfig().catch(() => undefined);
  }, [loadConfig]);

  // Apply persisted display prefs to <html> (works on both home and canvas).
  useEffect(() => {
    applyTheme(theme);
    applyFontScale(fontScale);
  }, [theme, fontScale]);

  return (
    <>
      <div className="mesh" aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="blob b4" />
      </div>
      {hasDoc ? <CanvasScreen /> : <HomePage />}
    </>
  );
}

function CanvasScreen() {
  const title = useCanvasStore((s) => s.doc?.title ?? '');
  const globalError = useCanvasStore((s) => s.errors.global);
  return (
    <div className="canvas-screen">
      <div className="top-bar">
        <button onClick={navigateHome}>← Documents</button>
        <strong>{title}</strong>
      </div>
      {globalError && <div className="error-bar">{globalError}</div>}
      <CanvasView />
    </div>
  );
}

function HomePage() {
  const [pasteText, setPasteText] = useState('');
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [importPreview, setImportPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const setCanvas = useCanvasStore((s) => s.setCanvas);

  useEffect(() => {
    api
      .listDocuments()
      .then((r) => setDocs(r.documents))
      .catch(() => setDocs([]));
  }, []);

  async function createDoc() {
    if (!pasteText.trim()) return;
    setError(null);
    try {
      const { document, canvas } = await api.createDocument('markdown', pasteText);
      setCanvas(document, canvas.nodes);
      navigateToDoc(document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const importHandlers = {
    onDelta: (t: string) => setImportPreview((s) => (s ?? '') + t),
    onDone: (document: Parameters<typeof setCanvas>[0], canvas: { nodes: Parameters<typeof setCanvas>[1] }) => {
      setImportPreview(null);
      setCanvas(document, canvas.nodes);
      navigateToDoc(document.id);
    },
    onError: (err: { type: string; status: number; message: string }) => {
      setImportPreview(null);
      setError(`${err.type} (${err.status}): ${err.message}`);
    },
  };

  async function removeDoc(id: string) {
    try {
      await api.deleteDocument(id);
      setDocs((ds) => ds.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    if (!item) return; // plain text falls through to the textarea
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    setError(null);
    setImportPreview('');
    try {
      const { mediaType, data } = await encodeImage(file);
      await api.importImage(mediaType, data, useCanvasStore.getState().selectedModel, importHandlers);
    } catch (err) {
      setImportPreview(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePdf(file: File) {
    setError(null);
    setImportPreview('');
    try {
      const data = await fileToBase64(file);
      await api.importPdf(data, useCanvasStore.getState().selectedModel, importHandlers);
    } catch (err) {
      setImportPreview(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (importPreview !== null) {
    return (
      <div className="home">
        <div className="wordmark">
          Gloss<span className="wm-dot">.</span>
        </div>
        <p className="tagline">Transcribing your file…</p>
        <div className="import-preview markdown-body">
          {importPreview || 'Reading the file…'}
        </div>
      </div>
    );
  }

  const filtered = query.trim()
    ? docs.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    : docs;

  return (
    <div className="home" onPaste={handlePaste}>
      <div className="wordmark">
        Gloss<span className="wm-dot">.</span>
      </div>
      <p className="tagline">
        Read anything deeply. <b>Select a passage, branch off,</b> and let AI
        unpack it — right where the question came up.
      </p>

      <div className="capture">
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste an article, markdown, or a screenshot… or drop in a PDF."
          rows={6}
        />
        <div className="capture-bar">
          <span className="capture-hint">
            <span>
              <kbd>⌘V</kbd> paste
            </span>
            <span>
              <kbd>img</kbd> auto-imports
            </span>
          </span>
          <span className="capture-spacer" />
          <button className="chipbtn" onClick={() => pdfInputRef.current?.click()}>
            ⬆ PDF
          </button>
          <ModelPicker />
          <button className="go-btn" onClick={createDoc} disabled={!pasteText.trim()}>
            Start reading →
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePdf(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {error && <div className="error-bar">{error}</div>}

      {docs.length > 0 && (
        <>
          <div className="lib-head">
            <h2>Library</h2>
            <input
              className="lib-search"
              placeholder="Search documents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="lib-rows">
            {filtered.map((d) => (
              <div key={d.id} className="lib-row">
                <button className="lib-open" onClick={() => navigateToDoc(d.id)}>
                  <span className="lib-glyph">{glyphFor(d.source)}</span>
                  <span className="lib-main">
                    <span className="lib-title">{d.title}</span>
                    <span className="lib-sub">
                      {d.branches != null && (
                        <span className="lib-branches">⑂ {d.branches} branch{d.branches === 1 ? '' : 'es'}</span>
                      )}
                      <span>{sourceLabel(d.source)}</span>
                      <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    </span>
                  </span>
                  {d.costUsd != null && d.costUsd > 0 && (
                    <span className="lib-cost">{formatCost(d.costUsd)}</span>
                  )}
                </button>
                <button
                  className="lib-del"
                  title="Delete document"
                  onClick={() => void removeDoc(d.id)}
                >
                  ×
                </button>
              </div>
            ))}
            {filtered.length === 0 && <div className="lib-empty">No documents match “{query}”.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function glyphFor(source?: string): string {
  if (source === 'pdf') return '📄';
  if (source === 'image') return '🖼️';
  return '📰';
}

function sourceLabel(source?: string): string {
  if (source === 'pdf') return 'PDF';
  if (source === 'image') return 'Image';
  return 'Article';
}
