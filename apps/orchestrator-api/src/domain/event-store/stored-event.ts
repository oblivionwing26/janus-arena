import type { JanusEvent, UnknownEvent } from '@janus/shared-kernel';

// What the event store persists and returns: any event with a valid envelope.
export type StoredEvent = JanusEvent | UnknownEvent;
