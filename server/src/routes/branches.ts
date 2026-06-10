import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { sendMessageSchema, type ChatMessage, type Usage } from '@reader/shared';
import { store } from '../store/store';
import { streamBranch } from '../ai/chat';
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
    let usage: Usage | undefined;
    try {
      const chunks = streamBranch(state, branch, body.model, c.req.raw.signal);

      for await (const chunk of chunks) {
        if (chunk.type === 'delta') {
          buffer += chunk.text;
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: chunk.text }) });
        } else {
          buffer = chunk.text;
          usage = chunk.usage;
        }
      }

      const finalUsage: Usage = usage ?? {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      };
      const message: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: buffer,
        createdAt: new Date().toISOString(),
        usage: finalUsage,
        model: body.model,
      };
      // The branch may have been deleted while we were streaming — persisting
      // then would resurrect a zombie branch in the JSON.
      if (store.getBranch(branch.id)) {
        branch.messages.push(message);
        await store.flushNow(state.document.id);
      }
      console.log(
        `[chat] branch=${branch.id} model=${body.model} in=${finalUsage.input_tokens} ` +
          `out=${finalUsage.output_tokens} cache_read=${finalUsage.cache_read_input_tokens}`,
      );
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ message, usage: finalUsage }) });
    } catch (err) {
      // Keep whatever streamed before the failure/abort so the user doesn't lose it.
      if (buffer && store.getBranch(branch.id)) {
        branch.messages.push({
          id: assistantId,
          role: 'assistant',
          text: buffer,
          createdAt: new Date().toISOString(),
          model: body.model,
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
