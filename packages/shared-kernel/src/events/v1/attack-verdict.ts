import { z } from 'zod';

import { oracleSchema } from '../../attack/proof-of-concept.js';
import { testTypeSchema } from '../../scope/scope-vocabulary.js';
import { defineEventSchema } from '../event-envelope.js';

// What a deterministic oracle said about an attempt the Red Team claimed (F3.3). Only an
// exploitable verdict becomes a finding; the agent's own opinion is never evidence.
export const attackVerdictEventSchema = defineEventSchema(
  'attack.verdict',
  1,
  z.object({
    attemptId: z.ulid(),
    testType: testTypeSchema,
    oracle: oracleSchema,
    exploitable: z.boolean(),
    evidence: z.string().max(500),
  }),
);

export type AttackVerdictEvent = z.infer<typeof attackVerdictEventSchema>;
