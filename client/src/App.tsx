import { useEffect, useState } from 'react';
import { formatCost, type DocumentSummary } from '@reader/shared';
import * as api from './api/client';
import { encodeImage } from './api/image';
import { useCanvasStore } from './state/canvasStore';
import { docCost } from './state/cost';
import { CanvasView } from './canvas/Canvas';
import { ModelPicker } from './components/ModelPicker';

export default function App() {
  const hasDoc = useCanvasStore((s) => s.doc !== null);
  const loadConfig = useCanvasStore((s) => s.loadConfig);

  useEffect(() => {
    void loadConfig().catch(() => undefined);
  }, [loadConfig]);

  return hasDoc ? <CanvasScreen /> : <HomePage />;
}

function CanvasScreen() {
  const title = useCanvasStore((s) => s.doc?.title ?? '');
  const reset = useCanvasStore((s) => s.reset);
  const globalError = useCanvasStore((s) => s.errors.global);
  const total = useCanvasStore((s) => docCost(s.nodes));
  return (
    <div className="canvas-screen">
      <div className="top-bar">
        <button onClick={reset}>← Documents</button>
        <strong>{title}</strong>
        <span
          className="doc-cost"
          title="Estimated total spent across all branches in this document"
        >
          {formatCost(total)} <span className="doc-cost-label">this doc</span>
        </span>
        <span className="top-bar-spacer" />
        <ModelPicker />
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
  const setCanvas = useCanvasStore((s) => s.setCanvas);
  const loadCanvas = useCanvasStore((s) => s.loadCanvas);

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
      await api.importImage(mediaType, data, useCanvasStore.getState().selectedModel, {
        onDelta: (t) => setImportPreview((s) => (s ?? '') + t),
        onDone: (document, canvas) => {
          setImportPreview(null);
          setCanvas(document, canvas.nodes);
        },
        onError: (err) => {
          setImportPreview(null);
          setError(`${err.type} (${err.status}): ${err.message}`);
        },
      });
    } catch (err) {
      setImportPreview(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (importPreview !== null) {
    return (
      <div className="paste-page">
        <h1>Reader</h1>
        <p>Transcribing your image…</p>
        <div className="import-preview markdown-body">
          {importPreview || 'Reading the image…'}
        </div>
      </div>
    );
  }

  return (
    <div className="paste-page" onPaste={handlePaste}>
      <h1>Reader</h1>
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
      <button onClick={createDoc} disabled={!pasteText.trim()}>
        Start reading
      </button>
      {error && <div className="error-bar">{error}</div>}
      {docs.length > 0 && (
        <div className="doc-list">
          <h2>Recent documents</h2>
          {docs.map((d) => (
            <button
              key={d.id}
              className="doc-list-item"
              onClick={() => void loadCanvas(d.id).catch((e) => setError(String(e)))}
            >
              <span>{d.title}</span>
              <span className="doc-date">{new Date(d.createdAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
