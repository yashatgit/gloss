import { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { regenerateSchema, sendMessageSchema, type ChatMessage, type Usage } from '@reader/shared';
import { store } from '../store/store';
import { streamBranch } from '../ai/chat';
import { toSSEError } from '../ai/errors';
import type { BranchNode } from '@reader/shared';
import type { DocState } from '../store/store';

export const branchesRoute = new Hono();

const EMPTY_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

/** Stream one assistant reply over SSE and persist it. Shared by send + regenerate. */
function streamReply(c: Context, state: DocState, branch: BranchNode, model: string) {
  return streamSSE(c, async (stream) => {
    const assistantId = nanoid(10);
    await stream.writeSSE({ event: 'start', data: JSON.stringify({ messageId: assistantId }) });

    let buffer = '';
    let usage: Usage | undefined;
    try {
      for await (const chunk of streamBranch(state, branch, model, c.req.raw.signal)) {
        if (chunk.type === 'delta') {
          buffer += chunk.text;
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: chunk.text }) });
        } else {
          buffer = chunk.text;
          usage = chunk.usage;
        }
      }
      const finalUsage = usage ?? EMPTY_USAGE;
      const message: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: buffer,
        createdAt: new Date().toISOString(),
        usage: finalUsage,
        model,
      };
      // The branch may have been deleted mid-stream — don't resurrect it.
      if (store.getBranch(branch.id)) {
        branch.messages.push(message);
        await store.flushNow(state.document.id);
      }
      console.log(
        `[chat] branch=${branch.id} model=${model} in=${finalUsage.input_tokens} ` +
          `out=${finalUsage.output_tokens} cache_read=${finalUsage.cache_read_input_tokens}`,
      );
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ message, usage: finalUsage }) });
    } catch (err) {
      if (buffer && store.getBranch(branch.id)) {
        branch.messages.push({
          id: assistantId,
          role: 'assistant',
          text: buffer,
          createdAt: new Date().toISOString(),
          model,
        });
        await store.flushNow(state.document.id);
      }
      await stream.writeSSE({ event: 'error', data: JSON.stringify(toSSEError(err)) });
    }
  });
}

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

  return streamReply(c, state, branch, body.model);
});

/**
 * Regenerate the assistant reply for the current history without appending a
 * new user message. Drops a trailing assistant turn if present, so it works
 * both as "retry after error" (last msg is the user turn) and "regenerate"
 * (last msg is an assistant turn to replace).
 */
branchesRoute.post('/:branchId/regenerate', async (c) => {
  const body = regenerateSchema.parse(await c.req.json());
  const found = store.getBranch(c.req.param('branchId'));
  if (!found) return c.json({ error: 'branch not found' }, 404);
  const { state, branch } = found;

  if (branch.messages.at(-1)?.role === 'assistant') branch.messages.pop();
  if (branch.messages.at(-1)?.role !== 'user') {
    return c.json({ error: 'nothing to regenerate' }, 400);
  }
  store.touch(state.document.id);

  return streamReply(c, state, branch, body.model);
});

branchesRoute.delete('/:branchId', (c) => {
  const ok = store.deleteBranch(c.req.param('branchId'));
  return ok ? c.body(null, 204) : c.json({ error: 'branch not found' }, 404);
});
