import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { sendMessageSchema, type ChatMessage, type Usage } from '@reader/shared';
import { store } from '../store/store';
import { createBranchStream } from '../ai/branchChat';
import { toSSEError } from '../ai/errors';

export const branchesRoute = new Hono();

branchesRoute.post('/:branchId/messages', async (c) => {
  const body = sendMessageSchema.parse(await c.req.json());
  const found = store.getBranch(c.req.param('branchId'));
  if (!found) return c.json({ error: 'branch not found' }, 404);
  const { state, branch } = found;

  branch.messages.push({
    id: nanoid(10),
    role: 'user',
    text: body.text,
    createdAt: new Date().toISOString(),
  });
  store.touch(state.document.id);

  return streamSSE(c, async (stream) => {
    const assistantId = nanoid(10);
    await stream.writeSSE({
      event: 'start',
      data: JSON.stringify({ messageId: assistantId }),
    });

    let buffer = '';
    try {
      const msgStream = createBranchStream(state, branch);
      c.req.raw.signal.addEventListener('abort', () => msgStream.controller.abort());

      for await (const event of msgStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          buffer += event.delta.text;
          await stream.writeSSE({
            event: 'delta',
            data: JSON.stringify({ text: event.delta.text }),
          });
        }
      }

      const final = await msgStream.finalMessage();
      const text = final.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const usage: Usage = {
        input_tokens: final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
        cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
      };
      const message: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text,
        createdAt: new Date().toISOString(),
        usage,
      };
      // The branch may have been deleted while we were streaming — persisting
      // then would resurrect a zombie branch in the JSON.
      if (store.getBranch(branch.id)) {
        branch.messages.push(message);
        await store.flushNow(state.document.id);
      }
      console.log(
        `[chat] branch=${branch.id} in=${usage.input_tokens} out=${usage.output_tokens} ` +
          `cache_read=${usage.cache_read_input_tokens} cache_write=${usage.cache_creation_input_tokens}`,
      );
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ message, usage }) });
    } catch (err) {
      // Keep whatever streamed before the failure/abort so the user doesn't lose it.
      if (buffer && store.getBranch(branch.id)) {
        branch.messages.push({
          id: assistantId,
          role: 'assistant',
          text: buffer,
          createdAt: new Date().toISOString(),
        });
        await store.flushNow(state.document.id);
      }
      await stream.writeSSE({ event: 'error', data: JSON.stringify(toSSEError(err)) });
    }
  });
});

branchesRoute.delete('/:branchId', (c) => {
  const ok = store.deleteBranch(c.req.param('branchId'));
  return ok ? c.body(null, 204) : c.json({ error: 'branch not found' }, 404);
});
