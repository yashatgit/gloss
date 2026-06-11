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

// ---------------------------------------------------------------------------
// Image generation models (OpenAI). Price = USD per image, by quality × size.
// Snapshot 2026-06 — verify at https://openai.com/api/pricing/.
// ---------------------------------------------------------------------------

export const IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;
export const IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface ImageModelInfo {
  id: string;
  label: string;
  /** price[quality][size] in USD per image. */
  price: Record<ImageQuality, Record<ImageSize, number>>;
}

export const IMAGE_MODELS: ImageModelInfo[] = [
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    price: {
      low: { '1024x1024': 0.006, '1024x1536': 0.005, '1536x1024': 0.005 },
      medium: { '1024x1024': 0.053, '1024x1536': 0.041, '1536x1024': 0.041 },
      high: { '1024x1024': 0.211, '1024x1536': 0.165, '1536x1024': 0.165 },
    },
  },
  {
    id: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    price: {
      low: { '1024x1024': 0.009, '1024x1536': 0.013, '1536x1024': 0.013 },
      medium: { '1024x1024': 0.034, '1024x1536': 0.05, '1536x1024': 0.05 },
      high: { '1024x1024': 0.133, '1024x1536': 0.2, '1536x1024': 0.2 },
    },
  },
  {
    id: 'gpt-image-1',
    label: 'GPT Image 1',
    price: {
      low: { '1024x1024': 0.011, '1024x1536': 0.016, '1536x1024': 0.016 },
      medium: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063 },
      high: { '1024x1024': 0.167, '1024x1536': 0.25, '1536x1024': 0.25 },
    },
  },
  {
    id: 'gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    price: {
      low: { '1024x1024': 0.005, '1024x1536': 0.006, '1536x1024': 0.006 },
      medium: { '1024x1024': 0.011, '1024x1536': 0.015, '1536x1024': 0.015 },
      high: { '1024x1024': 0.036, '1024x1536': 0.052, '1536x1024': 0.052 },
    },
  },
];

export const DEFAULT_IMAGE = {
  model: 'gpt-image-1.5',
  quality: 'low' as ImageQuality,
  size: '1024x1024' as ImageSize,
};

export function getImageModel(id: string): ImageModelInfo | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

export function isKnownImageModel(id: string): boolean {
  return IMAGE_MODELS.some((m) => m.id === id);
}

/** USD per image for a model/quality/size combination. */
export function imageCost(modelId: string, quality: ImageQuality, size: ImageSize): number {
  return getImageModel(modelId)?.price[quality][size] ?? 0;
}
