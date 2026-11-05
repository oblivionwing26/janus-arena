import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const agentStepEventSchema = defineEventSchema(
  'agent.step',
  1,
  z.object({
    stepIndex: z.int().min(0),
    url: z.url(),
    durationMs: z.number().min(0),
  }),
);

export type AgentStepEvent = z.infer<typeof agentStepEventSchema>;
