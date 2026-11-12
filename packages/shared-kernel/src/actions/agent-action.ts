import { z } from 'zod';

import { InvalidAgentActionError } from './invalid-agent-action-error.js';

/** A ref from the current observation (`e1`, `e2`…), never a selector. */
const refSchema = z
  .string()
  .regex(/^e[1-9][0-9]{0,4}$/)
  .describe('Ref of the element in the current observation, e.g. "e12".');

/**
 * The input of each action, without its `type`: the LLM tool schemas (action-tools.ts) and the
 * validated union below both come from here, so they cannot drift apart.
 */
export const agentActionInputs = {
  click: z.object({ ref: refSchema }),
  type: z.object({
    ref: refSchema,
    text: z.string().max(500).describe('Replaces the current content of the field.'),
    // F3.5a: some fields act only on Enter (a search box with no button), as people expect.
    submit: z
      .boolean()
      .optional()
      .describe('Press Enter after typing, as a person does to search or send a form.'),
  }),
  select: z.object({
    ref: refSchema,
    value: z.string().min(1).max(200).describe('Label of the option, exactly as observed.'),
  }),
  scroll: z.object({ direction: z.enum(['up', 'down']) }),
  back: z.object({}),
  // F3.5a: menus and pop-ups that cover the page close on Esc, as people expect.
  dismiss: z.object({}),
  wait: z.object({ ms: z.int().min(0).max(10_000).describe('Milliseconds to wait.') }),
  done: z.object({
    outcome: z.enum(['success', 'abandon']),
    reason: z.string().min(1).max(500).describe('One sentence, in the persona’s words.'),
  }),
};

/**
 * The navigator agent's action space (F1.2). The LLM proposes one of these per step; the
 * executor validates it before touching the browser.
 */
export const agentActionSchema = z.discriminatedUnion('type', [
  agentActionInputs.click.extend({ type: z.literal('click') }),
  agentActionInputs.type.extend({ type: z.literal('type') }),
  agentActionInputs.select.extend({ type: z.literal('select') }),
  agentActionInputs.scroll.extend({ type: z.literal('scroll') }),
  agentActionInputs.back.extend({ type: z.literal('back') }),
  agentActionInputs.dismiss.extend({ type: z.literal('dismiss') }),
  agentActionInputs.wait.extend({ type: z.literal('wait') }),
  agentActionInputs.done.extend({ type: z.literal('done') }),
]);

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentActionType = AgentAction['type'];

/** Validates a proposed action. Unknown fields are dropped; anything else invalid throws. */
export function parseAgentAction(input: unknown): AgentAction {
  const result = agentActionSchema.safeParse(input);
  if (!result.success) throw new InvalidAgentActionError(result.error.issues);
  return result.data;
}
