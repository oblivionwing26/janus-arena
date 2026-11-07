import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const agentStepEventSchema = defineEventSchema(
  'agent.step',
  1,
  z.object({
    stepIndex: z.int().min(0),
    url: z.url(),
    durationMs: z.number().min(0),
    /** Texts of the page's `alert` notices when the agent observed it (F1.6): form errors. */
    alerts: z.array(z.string().min(1).max(200)).max(20).optional(),
    /** Plain texts the agent saw (headings, prose, control names), to locate the code (F2.2). */
    texts: z.array(z.string().min(1).max(200)).max(40).optional(),
  }),
);

export type AgentStepEvent = z.infer<typeof agentStepEventSchema>;
