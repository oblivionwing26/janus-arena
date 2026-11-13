import { z } from 'zod';

import { blockReasonSchema, testTypeSchema } from '../../scope/scope-vocabulary.js';
import { defineEventSchema } from '../event-envelope.js';

// One request the Red Team sent to the target (F3.3): what, as whom and what came back. Never
// the bodies, tokens or query strings; a request the guard refused has no status.
export const attackAttemptEventSchema = defineEventSchema(
  'attack.attempt',
  1,
  z.object({
    attemptId: z.ulid(),
    /** The number the agent sees (#1, #2...). */
    number: z.int().min(1),
    testType: testTypeSchema,
    as: z.enum(['a', 'b', 'anonymous']),
    method: z.string().min(1).max(10),
    path: z.string().max(300),
    /** The endpoint the attempt counts against, "GET /rest/basket/:id" (F3.10). */
    endpoint: z.string().min(1).max(300).optional(),
    status: z.int().min(100).max(599).nullable(),
    bytes: z.int().min(0),
    blocked: blockReasonSchema.optional(),
  }),
);

export type AttackAttemptEvent = z.infer<typeof attackAttemptEventSchema>;
