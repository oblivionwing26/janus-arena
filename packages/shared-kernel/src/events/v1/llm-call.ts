import { z } from 'zod';

import { eventCostSchema } from '../event-cost.js';
import { defineEventSchema } from '../event-envelope.js';
import { modelRoleSchema } from '../model-role.js';

export const llmCallEventSchema = defineEventSchema(
  'llm.call',
  1,
  z.object({
    role: modelRoleSchema,
    model: z.string().min(1),
    durationMs: z.number().min(0),
    // Lets RecordedLLMAdapter (F0.6) match a recorded response.
    requestHash: z.string().min(1).optional(),
  }),
).extend({
  cost: eventCostSchema,
});

export type LlmCallEvent = z.infer<typeof llmCallEventSchema>;
