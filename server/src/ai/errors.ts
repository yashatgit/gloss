import Anthropic from '@anthropic-ai/sdk';
import type { SSEError } from '@reader/shared';

export function toSSEError(err: unknown): SSEError {
  if (err instanceof Anthropic.APIError) {
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
