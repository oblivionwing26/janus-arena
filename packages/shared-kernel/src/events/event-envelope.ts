import { z } from 'zod';

import { actorRoleSchema } from './actor-role.js';
import { agentIdSchema } from './agent-id.js';
import { eventCostSchema } from './event-cost.js';

// Fields shared by every event (ADR 0003). `type` and `payload` stay open here;
// each known event narrows them in events/v1.
export const eventEnvelopeSchema = z.object({
  id: z.ulid(),
  runId: z.ulid(),
  seq: z.int().min(0),
  ts: z.iso.datetime(),
  schemaVersion: z.int().min(1),
  actor: z.object({
    agentId: agentIdSchema,
    role: actorRoleSchema,
  }),
  type: z.string().min(1),
  payload: z.unknown(),
  cost: eventCostSchema.optional(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function defineEventSchema<
  const Type extends string,
  const Version extends number,
  Payload extends z.ZodType,
>(type: Type, schemaVersion: Version, payload: Payload) {
  return eventEnvelopeSchema.extend({
    type: z.literal(type),
    schemaVersion: z.literal(schemaVersion),
    payload,
  });
}
