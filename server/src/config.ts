import os from 'node:os';
import path from 'node:path';

// All server config flows through process.env here — no Vite-isms, so this
// module runs unchanged inside an Electron main process later.

export function port(): number {
  return Number(process.env.PORT ?? 8787);
}

export function resolveDataDir(): string {
  if (process.env.GLOSS_DATA_DIR) return process.env.GLOSS_DATA_DIR;
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'gloss');
  }
  return path.join(process.cwd(), 'data');
}
