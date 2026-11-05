import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

const amount = z.number().min(0);

// Emitted by the LLM gateway when a run's budget crosses 80 % (warning) or 100 % (exhausted).
export const budgetThresholdEventSchema = defineEventSchema(
  'budget.threshold',
  1,
  z.object({
    level: z.enum(['warning', 'exhausted']),
    usedTokens: z.int().min(0),
    usedEur: amount,
    maxTokens: z.int().positive(),
    maxEur: z.number().positive(),
  }),
);

export type BudgetThresholdEvent = z.infer<typeof budgetThresholdEventSchema>;
