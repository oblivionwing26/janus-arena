import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const findingCreatedEventSchema = defineEventSchema(
  'finding.created',
  1,
  z
    .object({
      findingId: z.ulid(),
      kind: z.enum(['static', 'dynamic']),
      severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
      title: z.string().min(1),
      status: z.enum(['suspected', 'confirmed']),
      pocRef: z.string().min(1).optional(),
    })
    .refine((finding) => finding.status !== 'confirmed' || finding.pocRef !== undefined, {
      message: 'A confirmed finding needs a reproducible PoC (pocRef)',
      path: ['pocRef'],
    }),
);

export type FindingCreatedEvent = z.infer<typeof findingCreatedEventSchema>;
