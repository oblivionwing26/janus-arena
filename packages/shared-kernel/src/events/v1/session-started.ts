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
    /**
     * Who the session is in a Launch Day run (F4.1): a legitimate shopper, or a saboteur. Only the
     * event log knows: the target never sees it. Absent in every earlier run, meaning legitimate.
     */
    role: z.enum(['legitimate', 'saboteur']).optional(),
    /** The address the session presents (X-Forwarded-For, simulated), when the run gives one. */
    client: z
      .string()
      .regex(/^[0-9a-fA-F:.]{1,64}$/)
      .optional(),
    /** The task the session plays (F1.9); absent when it plays the persona's own goal. */
    task: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
      .optional(),
  }),
);

export type SessionStartedEvent = z.infer<typeof sessionStartedEventSchema>;
