import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

export const verificationResultEventSchema = defineEventSchema(
  'verification.result',
  1,
  z.object({
    patchId: z.ulid(),
    verifier: z.enum(['poc-replay', 'regression-tests', 'synthlab-rerun', 'build-checks']),
    passed: z.boolean(),
    details: z.string().min(1).optional(),
  }),
);

export type VerificationResultEvent = z.infer<typeof verificationResultEventSchema>;
