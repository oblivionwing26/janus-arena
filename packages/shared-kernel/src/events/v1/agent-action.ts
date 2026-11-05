import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const agentActionEventSchema = defineEventSchema(
  'agent.action',
  1,
  z.object({
    stepIndex: z.int().min(0),
    // Open string for now; F1.2 defines the action space.
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
  }),
);

export type AgentActionEvent = z.infer<typeof agentActionEventSchema>;
