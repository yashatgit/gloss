import { Hono } from 'hono';
import { z } from 'zod';
import { keyStatus, PROVIDERS, setKey } from '../store/keys';

/**
 * BYOK key management. GET reports which providers have a key (and its source);
 * PUT sets or clears keys. Raw keys are never returned.
 */
export const keysRoute = new Hono();

keysRoute.get('/', (c) => c.json({ keys: keyStatus() }));

const putSchema = z.object({
  anthropic: z.string().nullable().optional(),
  openai: z.string().nullable().optional(),
});

keysRoute.put('/', async (c) => {
  const body = putSchema.parse(await c.req.json());
  for (const p of PROVIDERS) {
    if (p in body) setKey(p, body[p] ?? null);
  }
  return c.json({ keys: keyStatus() });
});
