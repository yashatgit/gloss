import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { SSEError } from '@gloss/shared';
import { ModelError } from './chat';

export function toSSEError(err: unknown): SSEError {
  if (err instanceof ModelError) {
    return { status: 400, type: 'model_error', message: err.message };
  }
  if (err instanceof Anthropic.APIError) {
    return {
      status: typeof err.status === 'number' ? err.status : 500,
      type: 'api_error',
      message: err.message,
    };
  }
  if (err instanceof OpenAI.APIError) {
    return {
      status: typeof err.status === 'number' ? err.status : 500,
      type: 'api_error',
      message: err.message,
    };
  }
  return {
    status: 500,
    type: 'internal_error',
    message: err instanceof Error ? err.message : String(err),
  };
}
