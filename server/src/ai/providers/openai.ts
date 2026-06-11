import OpenAI from 'openai';
import type { Usage } from '@reader/shared';
import { type ChatArgs, type ChatProvider, EMPTY_USAGE, type StreamChunk, type VisionArgs } from './types';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI();
  return client;
}

export function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Cheapest image model — low quality, 1024² (~$0.005/image). Returns base64 PNG. */
export const IMAGE_MODEL = 'gpt-image-1-mini';
export const IMAGE_COST_USD = 0.005;

export async function generateImage(prompt: string): Promise<string> {
  const res = await getClient().images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: '1024x1024',
    quality: 'low',
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('image generation returned no data');
  return b64;
}

/**
 * OpenAI bills the whole prompt and reports the cached subset separately;
 * normalize so input_tokens is the *uncached* remainder (matching how the
 * Anthropic shape and the cost formula treat it). OpenAI has no cache-write
 * charge, so cache_creation stays 0.
 */
function normalizeUsage(u: OpenAI.CompletionUsage | undefined): Usage {
  if (!u) return EMPTY_USAGE;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: Math.max(0, u.prompt_tokens - cached),
    output_tokens: u.completion_tokens,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  };
}

export const openaiProvider: ChatProvider = {
  async *streamChat({ model, instructions, document, messages, signal }: ChatArgs) {
    // One system message (stable prefix first → OpenAI auto-caches it).
    const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: `${instructions}\n\n${document}` },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await getClient().chat.completions.create(
      {
        model,
        messages: oaiMessages,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );

    let text = '';
    let usage: Usage = EMPTY_USAGE;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        yield { type: 'delta', text: delta } satisfies StreamChunk;
      }
      if (chunk.usage) usage = normalizeUsage(chunk.usage);
    }
    yield { type: 'final', text, usage, model };
  },

  async *streamVision({ model, mediaType, data, prompt, signal }: VisionArgs) {
    // PDFs use a `file` content part; images use `image_url`.
    const fileBlock: OpenAI.Chat.Completions.ChatCompletionContentPart =
      mediaType === 'application/pdf'
        ? {
            type: 'file',
            file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${data}` },
          }
        : { type: 'image_url', image_url: { url: `data:${mediaType};base64,${data}` } };
    const stream = await getClient().chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, fileBlock] }],
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );

    let text = '';
    let usage: Usage = EMPTY_USAGE;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        yield { type: 'delta', text: delta } satisfies StreamChunk;
      }
      if (chunk.usage) usage = normalizeUsage(chunk.usage);
    }
    yield { type: 'final', text, usage, model };
  },
};
