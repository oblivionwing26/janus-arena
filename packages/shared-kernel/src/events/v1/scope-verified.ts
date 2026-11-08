import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';
import { testTypeSchema } from '../../scope/scope-vocabulary.js';

// The target proved it is ours (F3.1, ADR 0005): every origin served the run's token at
// /.well-known/janus-verify.txt. The token itself is not recorded.
export const scopeVerifiedEventSchema = defineEventSchema(
  'scope.verified',
  1,
  z.object({
    target: z.string().min(1).max(100),
    origins: z.array(z.url()).min(1).max(10),
    excludedPaths: z.array(z.string().max(200)).max(100),
    allowedTests: z.array(testTypeSchema).max(20),
    maxRequestsPerSecond: z.number().positive(),
  }),
);

export type ScopeVerifiedEvent = z.infer<typeof scopeVerifiedEventSchema>;
