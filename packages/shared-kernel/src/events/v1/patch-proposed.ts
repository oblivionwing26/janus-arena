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
    // The agent's own account of the change (F2.8): agent text for humans, never evidence.
    summary: z.string().max(2000).optional(),
  }),
);

export type PatchProposedEvent = z.infer<typeof patchProposedEventSchema>;
