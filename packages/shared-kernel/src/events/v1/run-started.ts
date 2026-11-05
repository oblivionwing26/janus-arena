import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const runStartedEventSchema = defineEventSchema(
  'run.started',
  1,
  z.object({
    budget: z.object({
      maxTokens: z.int().positive(),
      maxEur: z.number().positive(),
    }),
  }),
);

export type RunStartedEvent = z.infer<typeof runStartedEventSchema>;
