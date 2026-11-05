import type { JanusEvent, UnknownEvent } from '@janus/shared-kernel';

/** Any event the console can show: a known v1 event, or an unknown one kept as received. */
export type ConsoleEvent = JanusEvent | UnknownEvent;
