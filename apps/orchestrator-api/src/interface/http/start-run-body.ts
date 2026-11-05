import { z } from 'zod';

/** Body of POST /runs. */
export const startRunBodySchema = z.object({
  target: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  ref: z.string().regex(/^[\w][\w./-]{0,99}$/),
  sessions: z.int().min(1).max(5),
  budget: z.object({
    maxTokens: z.int().positive().max(10_000_000),
    maxEur: z.number().positive().max(100),
  }),
});

export type StartRunBody = z.infer<typeof startRunBodySchema>;
