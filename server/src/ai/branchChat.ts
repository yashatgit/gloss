import type { BranchNode } from '@reader/shared';
import type { DocState } from '../store/store';
import { anthropic, MODEL } from './client';
import { buildSystemBlocks, toMessageParams } from './prompts';

/**
 * One streaming reply for a branch conversation. Stateless API: full message
 * history every turn. The system prefix is byte-identical across all branches
 * of a document, so every request reads the same prompt-cache entry.
 * NOTE: no temperature/top_p/top_k — removed on this model (400 if sent).
 */
export function createBranchStream(state: DocState, branch: BranchNode) {
  return anthropic.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: buildSystemBlocks(state.document),
    messages: toMessageParams(state, branch),
  });
}
