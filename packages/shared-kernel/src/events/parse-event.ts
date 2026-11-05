import { InvalidEventError } from './invalid-event-error.js';
import { janusEventSchema, supportedSchemaVersion, type JanusEvent } from './janus-event.js';
import { unknownEventSchema, type UnknownEvent } from './unknown-event.js';

/**
 * Validates a raw event. An invalid envelope, or a known type with an invalid payload,
 * throws InvalidEventError. A valid envelope with an unknown type, or with a schemaVersion
 * newer than this build supports, is returned untouched as an UnknownEvent.
 */
export function parseEvent(input: unknown): JanusEvent | UnknownEvent {
  const envelope = unknownEventSchema.safeParse(input);
  if (!envelope.success) throw new InvalidEventError(envelope.error.issues);

  const supported = supportedSchemaVersion(envelope.data.type);
  if (supported === undefined || envelope.data.schemaVersion > supported) return envelope.data;

  const known = janusEventSchema.safeParse(input);
  if (!known.success) throw new InvalidEventError(known.error.issues);
  return known.data;
}
