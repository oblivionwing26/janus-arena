import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const runCompletedEventSchema = defineEventSchema(
  'run.completed',
  1,
  z.object({
    outcome: z.enum(['success', 'error', 'budget_exhausted']),
    reason: z.string().min(1).optional(),
    /** How the run's sessions ended (F1.7); `excluded` failed on infrastructure after retries. */
    sessions: z
      .object({
        total: z.int().min(0),
        completed: z.int().min(0),
        failed: z.int().min(0),
        budgetExhausted: z.int().min(0),
        cancelled: z.int().min(0),
        excluded: z.int().min(0),
      })
      .optional(),
  }),
);

export type RunCompletedEvent = z.infer<typeof runCompletedEventSchema>;
