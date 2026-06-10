import Anthropic from '@anthropic-ai/sdk';

// Reads ANTHROPIC_API_KEY from the environment (loaded in index.ts).
export const anthropic = new Anthropic();

// Sonnet 4.6: best price/quality balance for grounded explanations —
// $3/$15 per MTok (vs Opus 4.8's $5/$25), 1M context, vision-capable,
// and a lower prompt-cache minimum (2048 tokens) so short docs cache too.
export const MODEL = 'claude-sonnet-4-6';
