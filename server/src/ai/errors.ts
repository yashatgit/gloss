import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { SSEError } from '@gloss/shared';
import { MissingKeyError } from '../store/keys';
import { ModelError } from './chat';

/** Concise, human-readable message for a provider HTTP error. */
function friendly(status: number, provider: string): string {
  switch (status) {
    case 401:
      return `Authentication failed — check your ${provider} API key.`;
    case 403:
      return `Your ${provider} key doesn't have access to this model.`;
    case 404:
      return `That ${provider} model wasn't found.`;
    case 413:
      return `The request is too large for ${provider}.`;
    case 429:
      return `${provider} rate limit hit — wait a moment and retry.`;
    case 500:
    case 502:
    case 503:
    case 529:
      return `${provider} is having trouble right now — please retry.`;
    default:
      return `${provider} request failed (${status}).`;
  }
}

export function toSSEError(err: unknown): SSEError {
  if (err instanceof MissingKeyError || err instanceof ModelError) {
    return { status: 400, type: 'model_error', message: err.message };
  }
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : 500;
    return { status, type: 'api_error', message: friendly(status, 'Anthropic') };
  }
  if (err instanceof OpenAI.APIError) {
    const status = typeof err.status === 'number' ? err.status : 500;
    return { status, type: 'api_error', message: friendly(status, 'OpenAI') };
  }
  return {
    status: 500,
    type: 'internal_error',
    message: err instanceof Error ? err.message : 'Something went wrong.',
  };
}
