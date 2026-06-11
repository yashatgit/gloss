import { useEffect, useRef, useState } from 'react';
import { type DocumentSummary } from '@gloss/shared';
import * as api from './api/client';
import { encodeImage, fileToBase64 } from './api/image';
import { applyFontScale, applyTheme, useCanvasStore } from './state/canvasStore';
import { CanvasView } from './canvas/Canvas';
import { ModelPicker } from './components/ModelPicker';
import { SettingsButton } from './components/SettingsButton';
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
      {hasDoc ? <CanvasScreen /> : <HomePage />}
      <SettingsButton />
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
      <div className="paste-page">
        <h1>Gloss</h1>
        <p>Transcribing your file…</p>
        <div className="import-preview markdown-body">
          {importPreview || 'Reading the file…'}
        </div>
      </div>
    );
  }

  return (
    <div className="paste-page" onPaste={handlePaste}>
      <h1>Gloss</h1>
      <p>
        Paste long-form text, markdown, or a screenshot — then select anything
        while reading to branch off an AI conversation about it.
      </p>
      <label className="model-row">
        Model: <ModelPicker />
      </label>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder="Paste text or markdown here — or paste an image anywhere on this page…"
        rows={14}
      />
      <div className="action-row">
        <button onClick={createDoc} disabled={!pasteText.trim()}>
          Start reading
        </button>
        <button className="upload-btn" onClick={() => pdfInputRef.current?.click()}>
          ⬆ Upload PDF
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
      {error && <div className="error-bar">{error}</div>}
      {docs.length > 0 && (
        <div className="doc-list">
          <h2>Recent documents</h2>
          {docs.map((d) => (
            <div key={d.id} className="doc-list-item">
              <button className="doc-open" onClick={() => navigateToDoc(d.id)}>
                <span>{d.title}</span>
                <span className="doc-date">{new Date(d.createdAt).toLocaleDateString()}</span>
              </button>
              <button
                className="doc-del"
                title="Delete document"
                onClick={() => void removeDoc(d.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
