import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// How a Blue Team remediation of a finding ended (F3.5): `fixed` once every verifier passed on
// one fix, which then names its patch and branch; `open` after the last iteration failed, with
// why. The history is in the run's patch.proposed and verification.result events.
export const findingRemediatedEventSchema = defineEventSchema(
  'finding.remediated',
  1,
  z
    .object({
      findingId: z.ulid(),
      status: z.enum(['fixed', 'open']),
      iterations: z.int().min(1).max(10),
      patchId: z.ulid().optional(),
      branch: z
        .string()
        .regex(/^janus\/fix-[0-9A-HJKMNP-TV-Z]{26}$/)
        .optional(),
      reason: z.string().min(1).max(2000).optional(),
    })
    .refine((payload) => payload.status !== 'fixed' || payload.patchId !== undefined, {
      message: 'A fixed finding names the patch that fixed it',
      path: ['patchId'],
    }),
);

export type FindingRemediatedEvent = z.infer<typeof findingRemediatedEventSchema>;
