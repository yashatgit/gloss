// Node entry point — the ONLY file that knows about @hono/node-server.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load repo-root .env before any module reads process.env (the Anthropic
// client is constructed at import time).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const { serve } = await import('@hono/node-server');
const { createApp } = await import('./app');
const { store } = await import('./store/store');
const { port } = await import('./config');

await store.init();

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set — AI requests will fail. Copy .env.example to .env.');
}

const server = serve({ fetch: createApp().fetch, port: port() }, (info) => {
  console.log(`reader server listening on http://localhost:${info.port}`);
});

function shutdown() {
  store.flushAllSync();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
