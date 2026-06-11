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
