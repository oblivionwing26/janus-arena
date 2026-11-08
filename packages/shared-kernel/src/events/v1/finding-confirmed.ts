import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// A finding became `confirmed` (F3.4): its PoC was replayed with fresh test users and its oracle
// said exploitable again. Events are append-only, so this is the status change; it always names
// the PoC, because no finding is confirmed without a reproducible one.
export const findingConfirmedEventSchema = defineEventSchema(
  'finding.confirmed',
  1,
  z.object({
    findingId: z.ulid(),
    /** The PoC artifact of the run, e.g. `poc/<findingId>.json`. */
    pocRef: z.string().min(1).max(200),
    evidence: z.string().max(500),
  }),
);

export type FindingConfirmedEvent = z.infer<typeof findingConfirmedEventSchema>;
