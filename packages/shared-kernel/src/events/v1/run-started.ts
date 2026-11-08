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
    /** The run's variants (F2.8): a generated B is `janus/variant-<runId>` in a local clone. */
    variants: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z][a-z0-9]{0,3}$/),
          ref: z.string().min(1).max(100),
          repo: z.string().min(1).max(500).optional(),
        }),
      )
      .max(4)
      .optional(),
  }),
);

export type RunStartedEvent = z.infer<typeof runStartedEventSchema>;
