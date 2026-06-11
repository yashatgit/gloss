import { getModel, visionModelFor, type BranchNode, type Doc } from '@gloss/shared';
import type { DocState } from '../store/store';
import { isProviderConfigured, providerClient } from './client';
import { documentBlock, SYSTEM_INSTRUCTIONS, toNeutralMessages } from './prompts';
import type { StreamChunk } from './providers/types';
import {
  generateImage as openaiGenerateImage,
  isConfigured as openaiConfigured,
  type ImageOpts,
} from './providers/openai';

const EXTRACTION_PROMPT = `Transcribe this document faithfully into clean Markdown. Preserve structure: headings, lists, quotes, thread/reply boundaries, tables, code, and page order. Transcribe text exactly — do not summarize, paraphrase, or editorialize. Describe non-text figures inline in brackets like [Figure: ...]. Output only the Markdown, no preamble.`;

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
 * Stream a transcription of an uploaded file (image or PDF) to Markdown using
 * the selected model's provider — both Anthropic and OpenAI accept base64
 * images and PDFs. Falls back to the provider's default vision model if the
 * selected one isn't multimodal.
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
    if (!fallback) throw new ModelError(`${info.provider} has no multimodal model`);
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

/**
 * Generate an explanatory image for a branch. OpenAI-only (image gen). Grounds
 * the image in the actual conversation — the latest assistant explanation and
 * the selected passage — so "show this as an image" illustrates the real content.
 */
export function generateBranchImage(
  branch: BranchNode,
  prompt: string,
  opts: ImageOpts,
): Promise<string> {
  if (!openaiConfigured()) {
    throw new ModelError('Image generation requires an OpenAI API key');
  }
  const lastAssistant = [...branch.messages].reverse().find((m) => m.role === 'assistant' && m.text);
  const content = (lastAssistant?.text ?? branch.anchor.quote).slice(0, 1500);
  const imagePrompt = `Create a clear, well-organized explanatory diagram that visually teaches the concept below. Use a clean, modern flat style. Lay it out logically (boxes, arrows, groupings). Include short labels and ALL TEXT MUST BE SPELLED CORRECTLY and legible — double-check spelling of every word. Avoid long paragraphs; prefer concise labels.

Concept (about "${branch.anchor.quote}"):
${content}

Extra instruction from the user: ${prompt}`;
  return openaiGenerateImage(imagePrompt, opts);
}

export type { Doc };
