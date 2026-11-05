import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const runCompletedEventSchema = defineEventSchema(
  'run.completed',
  1,
  z.object({
    outcome: z.enum(['success', 'error', 'budget_exhausted']),
    reason: z.string().min(1).optional(),
  }),
);

export type RunCompletedEvent = z.infer<typeof runCompletedEventSchema>;
