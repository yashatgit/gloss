import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { ZodError } from 'zod';
import { MODELS } from '@gloss/shared';
import { documentsRoute } from './routes/documents';
import { branchesRoute } from './routes/branches';
import { canvasRoute } from './routes/canvas';
import { keysRoute } from './routes/keys';
import { configuredProviders } from './ai/client';

/**
 * Pure Hono app factory — no Node-server specifics. Electron mounts this
 * unchanged via `serve({ fetch: createApp().fetch, port })`.
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
  app.route('/api/keys', keysRoute);
  app.route('/api', canvasRoute);

  // Production / Electron: serve the built client from GLOSS_SERVE_CLIENT so one
  // origin serves both the SPA and the API. Hash routing means no SPA fallback
  // beyond index.html is needed. Registered after /api so the API wins.
  const clientDir = process.env.GLOSS_SERVE_CLIENT;
  if (clientDir) {
    const root = path.relative(process.cwd(), clientDir) || '.';
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ path: path.join(root, 'index.html') }));
  }

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: 'invalid request', issues: err.issues }, 400);
    }
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}
