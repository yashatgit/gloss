// Bundle the Hono API server (TS + @gloss/shared) into a single self-contained
// CommonJS file the Electron main process can spawn with Node — no workspace
// resolution needed at runtime.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(here, '..', 'server', 'src', 'index.ts')],
  outfile: path.join(here, 'dist', 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm', // server index.ts uses top-level await
  target: 'node20',
  // esbuild can't bundle these correctly; keep them external (resolved at runtime).
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

console.log('✓ bundled → desktop/dist/server.mjs');

// Copy the built client into desktop/dist/client so the packaged app is
// self-contained (server serves it via GLOSS_SERVE_CLIENT).
const clientSrc = path.join(here, '..', 'client', 'dist');
const clientDst = path.join(here, 'dist', 'client');
const fs = await import('node:fs');
if (!fs.existsSync(clientSrc)) {
  throw new Error('client/dist not found — run `pnpm --filter @gloss/client build` first');
}
fs.rmSync(clientDst, { recursive: true, force: true });
fs.cpSync(clientSrc, clientDst, { recursive: true });
console.log('✓ copied client → desktop/dist/client');
