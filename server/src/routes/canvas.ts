import { Hono } from 'hono';
import { patchNodeSchema } from '@reader/shared';
import { store } from '../store/store';

export const canvasRoute = new Hono();

canvasRoute.get('/canvas/:docId', (c) => {
  const state = store.getDoc(c.req.param('docId'));
  if (!state) return c.json({ error: 'document not found' }, 404);
  return c.json({ document: state.document, nodes: state.canvas.nodes });
});

canvasRoute.patch('/nodes/:nodeId/position', async (c) => {
  const body = patchNodeSchema.parse(await c.req.json());
  const ok = store.updateNode(body.docId, c.req.param('nodeId'), {
    x: body.x,
    y: body.y,
    width: body.width,
    height: body.height,
  });
  return ok ? c.body(null, 204) : c.json({ error: 'node not found' }, 404);
});
