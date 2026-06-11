import fs from 'node:fs';
import path from 'node:path';
import type { Provider } from '@gloss/shared';
import { resolveDataDir } from '../config';

/**
 * Bring-your-own-key store. Keys pasted in the app are saved to
 * `<dataDir>/keys.json` and take precedence over environment variables, so a
 * packaged desktop app needs no `.env`. Raw keys never leave the server — the
 * API only ever reports whether a key is set and its source.
 */

const KEY_ENV: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export const PROVIDERS: Provider[] = ['anthropic', 'openai'];

let cache: Partial<Record<Provider, string>> | null = null;

function keysPath(): string {
  return path.join(resolveDataDir(), 'keys.json');
}

function load(): Partial<Record<Provider, string>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(keysPath(), 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

function envKey(provider: Provider): string | undefined {
  const v = process.env[KEY_ENV[provider]];
  return v && v.trim() ? v.trim() : undefined;
}

/** Effective key for a provider: in-app key overrides env. */
export function getKey(provider: Provider): string | undefined {
  const stored = load()[provider];
  if (stored && stored.trim()) return stored.trim();
  return envKey(provider);
}

export function hasKey(provider: Provider): boolean {
  return !!getKey(provider);
}

export function keySource(provider: Provider): 'stored' | 'env' | null {
  const stored = load()[provider];
  if (stored && stored.trim()) return 'stored';
  return envKey(provider) ? 'env' : null;
}

/** Set (non-empty string) or clear (null/empty) a provider's stored key. */
export function setKey(provider: Provider, key: string | null): void {
  const next = { ...load() };
  if (key && key.trim()) next[provider] = key.trim();
  else delete next[provider];
  cache = next;
  const dir = resolveDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keysPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

export interface KeyStatus {
  set: boolean;
  source: 'stored' | 'env' | null;
}

export function keyStatus(): Record<Provider, KeyStatus> {
  return Object.fromEntries(
    PROVIDERS.map((p) => [p, { set: hasKey(p), source: keySource(p) }]),
  ) as Record<Provider, KeyStatus>;
}

/** Thrown when a request needs a provider whose key isn't configured. */
export class MissingKeyError extends Error {
  constructor(public provider: Provider) {
    super(
      `No ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key. Add one in Settings → API keys.`,
    );
    this.name = 'MissingKeyError';
  }
}
