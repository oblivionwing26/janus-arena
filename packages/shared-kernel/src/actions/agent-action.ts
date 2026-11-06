import { z } from 'zod';

import { InvalidAgentActionError } from './invalid-agent-action-error.js';

/** A ref from the current observation (`e1`, `e2`…), never a selector. */
const refSchema = z.string().regex(/^e[1-9][0-9]{0,4}$/);

/**
 * The navigator agent's action space (F1.2). The LLM proposes one of these per step; the
 * executor validates it before touching the browser.
 */
export const agentActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), ref: refSchema }),
  z.object({ type: z.literal('type'), ref: refSchema, text: z.string().max(500) }),
  z.object({ type: z.literal('select'), ref: refSchema, value: z.string().min(1).max(200) }),
  z.object({ type: z.literal('scroll'), direction: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('wait'), ms: z.int().min(0).max(10_000) }),
  z.object({
    type: z.literal('done'),
    outcome: z.enum(['success', 'abandon']),
    reason: z.string().min(1).max(500),
  }),
]);

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentActionType = AgentAction['type'];

/** Validates a proposed action. Unknown fields are dropped; anything else invalid throws. */
export function parseAgentAction(input: unknown): AgentAction {
  const result = agentActionSchema.safeParse(input);
  if (!result.success) throw new InvalidAgentActionError(result.error.issues);
  return result.data;
}
