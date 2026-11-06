import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// What a deterministic oracle found after a session (F1.9): did the target end up in the state
// the task asks for? This, not the agent's own `done`, is task success. `unverifiable` means the
// oracle could not read the target; such sessions are left out of the statistics.
export const taskVerifiedEventSchema = defineEventSchema(
  'task.verified',
  1,
  z.object({
    taskId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
    status: z.enum(['passed', 'failed', 'unverifiable']),
    /** Each condition of the task and whether it held, e.g. `quantity of Taza de cerámica = 2`. */
    checks: z
      .array(
        z.object({
          check: z.string().min(1).max(200),
          passed: z.boolean(),
          detail: z.string().min(1).max(300).optional(),
        }),
      )
      .max(20),
    /** The order that satisfied the task, or the newest one checked. */
    orderId: z.int().min(1).optional(),
  }),
);

export type TaskVerifiedEvent = z.infer<typeof taskVerifiedEventSchema>;
