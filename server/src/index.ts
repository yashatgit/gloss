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

const { configuredProviders } = await import('./ai/client');
const providers = configuredProviders();
if (providers.length === 0) {
  console.warn(
    'WARNING: no provider API keys set (ANTHROPIC_API_KEY / OPENAI_API_KEY) — AI requests will fail. Copy .env.example to .env.',
  );
} else {
  console.log(`configured providers: ${providers.join(', ')}`);
}

const server = serve({ fetch: createApp().fetch, port: port() }, (info) => {
  console.log(`gloss server listening on http://localhost:${info.port}`);
});

function shutdown() {
  store.flushAllSync();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
