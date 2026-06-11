import { Hono } from 'hono';
import { ZodError } from 'zod';
import { MODELS } from '@gloss/shared';
import { documentsRoute } from './routes/documents';
import { branchesRoute } from './routes/branches';
import { canvasRoute } from './routes/canvas';
import { configuredProviders } from './ai/client';

/**
 * Pure Hono app factory — no Node-server specifics. Electron later mounts
 * this unchanged via `serve({ fetch: createApp().fetch, port })`.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // Which providers have keys + the full model catalog for the picker.
  app.get('/api/config', (c) =>
    c.json({ providers: configuredProviders(), models: MODELS }),
  );

  app.route('/api/documents', documentsRoute);
  app.route('/api/branches', branchesRoute);
  app.route('/api', canvasRoute);

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: 'invalid request', issues: err.issues }, 400);
    }
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}
