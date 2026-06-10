import { getModel, visionModelFor, type BranchNode, type Doc } from '@reader/shared';
import type { DocState } from '../store/store';
import { isProviderConfigured, providerClient } from './client';
import { documentBlock, SYSTEM_INSTRUCTIONS, toNeutralMessages } from './prompts';
import type { StreamChunk } from './providers/types';

const EXTRACTION_PROMPT = `Transcribe this image faithfully into clean Markdown. Preserve structure: headings, lists, quotes, thread/reply boundaries, tables, code. Transcribe text exactly — do not summarize, paraphrase, or editorialize. Describe non-text figures inline in brackets like [Figure: ...]. Output only the Markdown, no preamble.`;

export class ModelError extends Error {}

/** Stream a branch reply with the requested model's provider. */
export function streamBranch(
  state: DocState,
  branch: BranchNode,
  model: string,
  signal: AbortSignal,
): AsyncIterable<StreamChunk> {
  const info = getModel(model);
  if (!info) throw new ModelError(`unknown model ${model}`);
  if (!isProviderConfigured(info.provider)) {
    throw new ModelError(`${info.provider} is not configured (missing API key)`);
  }
  return providerClient(info.provider).streamChat({
    model,
    instructions: SYSTEM_INSTRUCTIONS,
    document: documentBlock(state.document),
    messages: toNeutralMessages(state, branch),
    signal,
  });
}

/**
 * Stream an image transcription. If the requested model isn't vision-capable,
 * fall back to the same provider's default vision model so import still works.
 */
export function streamTranscription(
  requestedModel: string,
  mediaType: string,
  data: string,
  signal: AbortSignal,
): AsyncIterable<StreamChunk> {
  let info = getModel(requestedModel);
  if (!info) throw new ModelError(`unknown model ${requestedModel}`);
  if (!info.vision) {
    const fallback = visionModelFor(info.provider);
    if (!fallback) throw new ModelError(`${info.provider} has no vision model`);
    info = fallback;
  }
  if (!isProviderConfigured(info.provider)) {
    throw new ModelError(`${info.provider} is not configured (missing API key)`);
  }
  return providerClient(info.provider).streamVision({
    model: info.id,
    mediaType,
    data,
    prompt: EXTRACTION_PROMPT,
    signal,
  });
}

export type { Doc };
