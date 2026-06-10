import type { Usage } from './types';

export type Provider = 'anthropic' | 'openai';

export interface ModelPrice {
  /** USD per 1M tokens. */
  input: number;
  output: number;
  /** Per 1M tokens served from cache (reduced input rate). */
  cachedInput: number;
  /** Per 1M tokens written to cache. Anthropic only; 0 for OpenAI. */
  cacheWrite: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  provider: Provider;
  vision: boolean;
  price: ModelPrice;
}

/**
 * Pricing is manually maintained — verify against the provider pages before
 * trusting the cost readout as more than an estimate:
 *   Anthropic: https://platform.claude.com/docs/en/pricing  (cache read ~0.1x in, write 1.25x in)
 *   OpenAI:    https://openai.com/api/pricing/
 * Snapshot date: 2026-06.
 */
export const MODELS: ModelInfo[] = [
  // --- Anthropic ---
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    vision: true,
    price: { input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25 },
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    vision: true,
    price: { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    vision: true,
    price: { input: 1, output: 5, cachedInput: 0.1, cacheWrite: 1.25 },
  },
  // --- OpenAI ---
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'openai',
    vision: true,
    price: { input: 2.5, output: 15, cachedInput: 0.25, cacheWrite: 0 },
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'openai',
    vision: true,
    price: { input: 2, output: 8, cachedInput: 0.5, cacheWrite: 0 },
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    provider: 'openai',
    vision: true,
    price: { input: 0.4, output: 1.6, cachedInput: 0.1, cacheWrite: 0 },
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    vision: true,
    price: { input: 2.5, output: 10, cachedInput: 1.25, cacheWrite: 0 },
  },
];

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export function isKnownModel(id: string): boolean {
  return MODELS.some((m) => m.id === id);
}

/** First vision-capable model for a provider (used for image transcription). */
export function visionModelFor(provider: Provider): ModelInfo | undefined {
  return MODELS.find((m) => m.provider === provider && m.vision);
}

/** Estimated cost in USD for one request's usage, attributed to its model. */
export function costOfUsage(modelId: string | undefined, usage: Usage | undefined): number {
  if (!modelId || !usage) return 0;
  const m = getModel(modelId);
  if (!m) return 0;
  const { input, output, cachedInput, cacheWrite } = m.price;
  return (
    (usage.input_tokens * input +
      usage.cache_read_input_tokens * cachedInput +
      usage.cache_creation_input_tokens * cacheWrite +
      usage.output_tokens * output) /
    1_000_000
  );
}

/** Compact USD formatter for tiny per-branch amounts. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
