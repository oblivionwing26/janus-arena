import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const agentActionEventSchema = defineEventSchema(
  'agent.action',
  1,
  z.object({
    stepIndex: z.int().min(0),
    // Open string: the navigator's action space (AgentAction['type'], F1.2) plus the scripted
    // agent's own actions (goto, wait for URL, snapshot). Old events must keep replaying.
    action: z.string().min(1),
    ref: z.string().min(1).optional(),
    selector: z.string().min(1).optional(),
    boundingBox: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number().min(0),
        height: z.number().min(0),
      })
      .optional(),
    durationMs: z.number().min(0),
    ok: z.boolean(),
    /** DOM mutations seen right after the action (F1.6). 0 on a click is a dead click. */
    domMutations: z.int().min(0).optional(),
    /** Why a failed action failed, as a domain error code (e.g. `browser.element-obscured`). */
    errorCode: z
      .string()
      .regex(/^[a-z]+(\.[a-z-]+)+$/)
      .optional(),
  }),
);

export type AgentActionEvent = z.infer<typeof agentActionEventSchema>;
