import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';
import { blockReasonSchema, testTypeSchema } from '../../scope/scope-vocabulary.js';

// A request the network guard refused (F3.1): origin and path only, never the query or body.
export const scopeBlockedEventSchema = defineEventSchema(
  'scope.blocked',
  1,
  z.object({
    method: z.string().min(1).max(10),
    origin: z.string().min(1).max(200),
    path: z.string().max(300),
    testType: testTypeSchema,
    reason: blockReasonSchema,
  }),
);

export type ScopeBlockedEvent = z.infer<typeof scopeBlockedEventSchema>;
