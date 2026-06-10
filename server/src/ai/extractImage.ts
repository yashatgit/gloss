import type { ImportImageBody } from '@reader/shared';
import { anthropic, MODEL } from './client';

const EXTRACTION_PROMPT = `Transcribe this image faithfully into clean Markdown. Preserve structure: headings, lists, quotes, thread/reply boundaries, tables, code. Transcribe text exactly — do not summarize, paraphrase, or editorialize. Describe non-text figures inline in brackets like [Figure: ...]. Output only the Markdown, no preamble.`;

/** One-shot vision transcription — extraction happens once at import. */
export function createExtractionStream(body: ImportImageBody) {
  return anthropic.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: body.media_type, data: body.data },
          },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });
}
