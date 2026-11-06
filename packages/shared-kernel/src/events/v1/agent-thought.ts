import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// The navigator's optional one-line `thought` for a step (F1.4). An annotation for humans
// reading a replay: never evidence, never an input to friction signals.
export const agentThoughtEventSchema = defineEventSchema(
  'agent.thought',
  1,
  z.object({
    stepIndex: z.int().min(0),
    text: z.string().min(1).max(200),
  }),
);

export type AgentThoughtEvent = z.infer<typeof agentThoughtEventSchema>;
