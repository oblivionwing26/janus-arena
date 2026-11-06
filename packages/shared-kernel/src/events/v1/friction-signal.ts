import { z } from 'zod';

import { agentIdSchema } from '../agent-id.js';
import { defineEventSchema } from '../event-envelope.js';

export const frictionSignalEventSchema = defineEventSchema(
  'friction.signal',
  1,
  z.object({
    detector: z.enum([
      'rage-click',
      'dead-click',
      'backtrack',
      'form-error',
      'extra-steps',
      'abandonment',
      'technical-error',
      'performance',
    ]),
    severity: z.enum(['low', 'medium', 'high']),
    // Signals are computed by code from other events; they must point at them.
    evidenceEventIds: z.array(z.ulid()).min(1),
    /** The session the friction happened in, and where (F1.5); for the heatmap and report. */
    agentId: agentIdSchema.optional(),
    stepIndex: z.int().min(0).optional(),
    url: z.url().optional(),
  }),
);

export type FrictionSignalEvent = z.infer<typeof frictionSignalEventSchema>;
