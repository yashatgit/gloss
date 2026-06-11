import Anthropic from '@anthropic-ai/sdk';
import type { Usage } from '@gloss/shared';
import type { ChatArgs, ChatProvider, StreamChunk, VisionArgs } from './types';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function buildSystemBlocks(
  instructions: string,
  document: string,
): Anthropic.TextBlockParam[] {
  // Stable prefix; cache_control on the last block caches instructions+document
  // together. Byte-identical across all branches/turns of one document.
  return [
    { type: 'text', text: instructions },
    {
      type: 'text',
      text: document,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function normalizeUsage(u: Anthropic.Usage): Usage {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  };
}

export const anthropicProvider: ChatProvider = {
  async *streamChat({ model, instructions, document, messages, signal }: ChatArgs) {
    // NOTE: no temperature/top_p/top_k — removed on Claude 4.7+/Fable.
    const stream = getClient().messages.stream(
      {
        model,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        system: buildSystemBlocks(instructions, document),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'delta', text: event.delta.text } satisfies StreamChunk;
      }
    }
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    yield { type: 'final', text, usage: normalizeUsage(final.usage), model };
  },

  async *streamVision({ model, mediaType, data, prompt, signal }: VisionArgs) {
    // PDFs go through Claude's native document block; images through an image block.
    const fileBlock: Anthropic.ContentBlockParam =
      mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
              data,
            },
          };
    const stream = getClient().messages.stream(
      {
        model,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }],
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'delta', text: event.delta.text } satisfies StreamChunk;
      }
    }
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    yield { type: 'final', text, usage: normalizeUsage(final.usage), model };
  },
};
