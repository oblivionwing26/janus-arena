import type { StoredEvent } from './stored-event.js';

export interface SubscribeOptions {
  /** First seq to deliver. Defaults to 0, i.e. the whole run so far, then live events. */
  readonly fromSeq?: number;
  /** Ends the iteration, even while it is waiting for the next event. */
  readonly signal?: AbortSignal;
}

/**
 * Append-only log of run events (ADR 0003). Every adapter must pass
 * the shared contract suite in src/test-support/event-store-contract.ts.
 */
export interface EventStorePort {
  /**
   * Stores a batch atomically: either every event is stored or none is.
   * Throws DuplicateEventSeqError if a (runId, seq) pair already exists or repeats in the batch.
   */
  append(events: readonly StoredEvent[]): Promise<void>;

  /** Events of a run ordered by seq, starting at fromSeq (inclusive) when given. */
  readRun(runId: string, fromSeq?: number): Promise<StoredEvent[]>;

  /**
   * Existing events from fromSeq, then new ones as they are appended, in seq order,
   * with no gaps or duplicates. Stops when the consumer breaks out or the signal aborts.
   */
  subscribe(runId: string, options?: SubscribeOptions): AsyncIterable<StoredEvent>;
}

export const EVENT_STORE_PORT = Symbol('EventStorePort');
