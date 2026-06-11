import { z } from 'zod';
import { isKnownModel } from './models';

const modelId = z.string().refine(isKnownModel, { message: 'unknown model' });

export const createDocumentSchema = z.object({
  source: z.enum(['text', 'markdown']),
  text: z.string().min(1).max(2_000_000),
});

export const importImageSchema = z.object({
  media_type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  // ~22MB decoded — the client downscales to well under this; the cap stops
  // a runaway body from exhausting server memory.
  data: z.string().min(1).max(30_000_000),
  model: modelId,
});

export const importPdfSchema = z.object({
  // base64 PDF. ~30MB decoded cap.
  data: z.string().min(1).max(40_000_000),
  model: modelId,
});

export const anchorSchema = z.object({
  nodeId: z.string(),
  messageId: z.string().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quote: z.string().min(1),
  prefix: z.string(),
  suffix: z.string(),
});

export const createBranchSchema = z.object({
  parentNodeId: z.string(),
  anchor: anchorSchema,
  title: z.string().min(1).max(200),
});

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(50_000),
  model: modelId,
});

export const regenerateSchema = z.object({
  model: modelId,
});

export const generateImageSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

export const patchNodeSchema = z.object({
  docId: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(120).max(2000).optional(),
  height: z.number().min(80).max(2000).optional(),
});

export type CreateDocumentBody = z.infer<typeof createDocumentSchema>;
export type ImportImageBody = z.infer<typeof importImageSchema>;
export type CreateBranchBody = z.infer<typeof createBranchSchema>;
export type SendMessageBody = z.infer<typeof sendMessageSchema>;
export type PatchNodeBody = z.infer<typeof patchNodeSchema>;
