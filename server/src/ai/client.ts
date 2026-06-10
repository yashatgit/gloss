import Anthropic from '@anthropic-ai/sdk';

// Reads ANTHROPIC_API_KEY from the environment (loaded in index.ts).
export const anthropic = new Anthropic();

export const MODEL = 'claude-opus-4-8';
