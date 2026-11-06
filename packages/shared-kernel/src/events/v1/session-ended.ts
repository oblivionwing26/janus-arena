import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// How one agent session ended (F1.4), written by the session itself. `abandon` is the persona
// choosing to give up; `patience_exhausted` is its PatienceBudget running out first.
export const sessionEndedEventSchema = defineEventSchema(
  'session.ended',
  1,
  z.object({
    outcome: z.enum(['success', 'abandon', 'patience_exhausted', 'budget_exhausted']),
    reason: z.string().min(1).max(500).optional(),
    steps: z.int().min(0),
    durationMs: z.number().min(0),
  }),
);

export type SessionEndedEvent = z.infer<typeof sessionEndedEventSchema>;
