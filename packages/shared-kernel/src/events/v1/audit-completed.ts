import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

const count = z.int().min(0);

// The differential audit of a variant (F2.7): what variant B introduces against base A, by
// static analysis and the HTTP surface map, and whether the gate blocks B. Introduced findings
// are recorded one by one as finding.created; this event is the verdict.
export const auditCompletedEventSchema = defineEventSchema(
  'audit.completed',
  1,
  z.object({
    base: z.object({ ref: z.string().min(1), sha: z.string().regex(/^[0-9a-f]{40}$/) }),
    variant: z.object({ ref: z.string().min(1), sha: z.string().regex(/^[0-9a-f]{40}$/) }),
    introduced: z.object({
      findings: count,
      endpoints: count,
      high: count,
      critical: count,
    }),
    blocked: z.boolean(),
    /** Why B is blocked, one line per high or critical change; empty when it passes. */
    reasons: z.array(z.string().min(1).max(300)).max(50),
  }),
);

export type AuditCompletedEvent = z.infer<typeof auditCompletedEventSchema>;
