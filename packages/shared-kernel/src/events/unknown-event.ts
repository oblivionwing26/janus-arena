import type { z } from 'zod';

import { eventEnvelopeSchema } from './event-envelope.js';
import { supportedSchemaVersion, type JanusEvent } from './janus-event.js';

// An event with a valid envelope whose type (or schemaVersion) this build does not know.
// Every field is kept as received so replays of newer runs never break.
export const unknownEventSchema = eventEnvelopeSchema.loose();

export type UnknownEvent = z.infer<typeof unknownEventSchema>;

export function isKnownEvent(event: JanusEvent | UnknownEvent): event is JanusEvent {
  return supportedSchemaVersion(event.type) === event.schemaVersion;
}
