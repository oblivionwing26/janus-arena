import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// Which slot of the run an agent session fills (F1.7): its variant, who plays it and with
// which seed. A/B pairs share persona and seed; each infrastructure retry is a new session with
// its own agentId and attempt number. Statistics (F1.8) and friction per variant read this.
export const sessionStartedEventSchema = defineEventSchema(
  'session.started',
  1,
  z.object({
    variant: z.string().regex(/^[a-z][a-z0-9]{0,3}$/),
    kind: z.enum(['scripted', 'persona', 'baseline']),
    persona: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
      .optional(),
    seed: z.int().min(0).max(9999),
    attempt: z.int().min(1),
    /** The task the session plays (F1.9); absent when it plays the persona's own goal. */
    task: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
      .optional(),
  }),
);

export type SessionStartedEvent = z.infer<typeof sessionStartedEventSchema>;
