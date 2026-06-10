import fsp from 'node:fs/promises';
import path from 'node:path';
import { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import {
  createDocumentSchema,
  importImageSchema,
  importPdfSchema,
  createBranchSchema,
  type BranchNode,
  type Canvas,
  type Doc,
  type DocumentNode,
  type DocumentSource,
} from '@reader/shared';
import { store } from '../store/store';
import { assetsDir, docDir } from '../store/paths';
import { streamTranscription } from '../ai/chat';
import { toSSEError } from '../ai/errors';

export const documentsRoute = new Hono();

/** Some models wrap transcriptions in a ```markdown … ``` fence — unwrap it. */
function stripCodeFence(md: string): string {
  const t = md.trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/i);
  return m ? m[1]!.trim() : t;
}

function deriveTitle(markdown: string): string {
  for (const line of markdown.split('\n')) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed) return trimmed.slice(0, 80);
  }
  return 'Untitled';
}

function makeDocumentNode(docId: string): DocumentNode {
  return {
    id: nanoid(10),
    kind: 'document',
    docId,
    position: { x: 0, y: 0 },
    width: 720,
  };
}

documentsRoute.get('/', (c) => c.json({ documents: store.listDocuments() }));

documentsRoute.post('/', async (c) => {
  const body = createDocumentSchema.parse(await c.req.json());
  const document: Doc = {
    id: nanoid(10),
    title: deriveTitle(body.text),
    source: body.source,
    markdown: body.text,
    createdAt: new Date().toISOString(),
  };
  const canvas: Canvas = { nodes: [makeDocumentNode(document.id)] };
  store.createDocument(document, canvas);
  return c.json({ document, canvas }, 201);
});

/** Shared SSE import: transcribe a file (image/PDF) to Markdown → new document. */
function runImport(
  c: Context,
  opts: {
    model: string;
    mediaType: string;
    data: string;
    source: DocumentSource;
    ext: string;
    fallbackTitle: string;
  },
) {
  return streamSSE(c, async (stream) => {
    let markdown = '';
    try {
      for await (const chunk of streamTranscription(
        opts.model,
        opts.mediaType,
        opts.data,
        c.req.raw.signal,
      )) {
        if (chunk.type === 'delta') {
          markdown += chunk.text;
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: chunk.text }) });
        } else {
          markdown = chunk.text;
        }
      }

      const clean = stripCodeFence(markdown);
      const docId = nanoid(10);
      const assetRel = path.join('assets', `original.${opts.ext}`);
      await fsp.mkdir(assetsDir(docId), { recursive: true });
      await fsp.writeFile(path.join(docDir(docId), assetRel), Buffer.from(opts.data, 'base64'));

      const document: Doc = {
        id: docId,
        title: deriveTitle(clean) || opts.fallbackTitle,
        source: opts.source,
        markdown: clean,
        originalImagePath: assetRel,
        createdAt: new Date().toISOString(),
      };
      const canvas: Canvas = { nodes: [makeDocumentNode(docId)] };
      store.createDocument(document, canvas);
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ document, canvas }) });
    } catch (err) {
      // Don't discard a partial transcription — persist it so it's recoverable.
      if (markdown.trim()) {
        const clean = stripCodeFence(markdown);
        const document: Doc = {
          id: nanoid(10),
          title: deriveTitle(clean) || 'Partial transcription',
          source: opts.source,
          markdown: clean,
          createdAt: new Date().toISOString(),
        };
        store.createDocument(document, { nodes: [makeDocumentNode(document.id)] });
      }
      await stream.writeSSE({ event: 'error', data: JSON.stringify(toSSEError(err)) });
    }
  });
}

documentsRoute.post('/import-image', async (c) => {
  const body = importImageSchema.parse(await c.req.json());
  return runImport(c, {
    model: body.model,
    mediaType: body.media_type,
    data: body.data,
    source: 'image',
    ext: body.media_type.split('/')[1] ?? 'png',
    fallbackTitle: 'Pasted image',
  });
});

documentsRoute.post('/import-pdf', async (c) => {
  const body = importPdfSchema.parse(await c.req.json());
  return runImport(c, {
    model: body.model,
    mediaType: 'application/pdf',
    data: body.data,
    source: 'pdf',
    ext: 'pdf',
    fallbackTitle: 'PDF document',
  });
});

documentsRoute.post('/:docId/branches', async (c) => {
  const docId = c.req.param('docId');
  const body = createBranchSchema.parse(await c.req.json());
  const state = store.getDoc(docId);
  if (!state) return c.json({ error: 'document not found' }, 404);
  const parent = state.canvas.nodes.find((n) => n.id === body.parentNodeId);
  if (!parent) return c.json({ error: 'parent node not found' }, 404);

  // Place to the right of the parent; client may reposition immediately.
  const parentWidth = parent.kind === 'document' ? parent.width : 420;
  const node: BranchNode = {
    id: nanoid(10),
    kind: 'branch',
    docId,
    position: { x: parent.position.x + parentWidth + 120, y: parent.position.y },
    parentNodeId: body.parentNodeId,
    anchor: body.anchor,
    title: body.title,
    messages: [],
  };
  store.addBranch(docId, node);
  return c.json({ node }, 201);
});
