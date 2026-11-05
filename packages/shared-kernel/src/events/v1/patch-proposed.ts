import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// Agents that change code work only on janus/variant-<runId> or janus/fix-<findingId>.
const janusBranch = z.string().regex(/^janus\/(?:variant|fix)-[0-9A-HJKMNP-TV-Z]{26}$/);

export const patchProposedEventSchema = defineEventSchema(
  'patch.proposed',
  1,
  z.object({
    patchId: z.ulid(),
    author: z.enum(['ui-engineer', 'blue-team']),
    findingId: z.ulid().optional(),
    branch: janusBranch,
    diff: z.string().min(1),
  }),
);

export type PatchProposedEvent = z.infer<typeof patchProposedEventSchema>;
