import {
  newUlid,
  type ActorRole,
  type EventCost,
  type JanusEvent,
  type JanusEventType,
} from '@janus/shared-kernel';

import { DuplicateEventSeqError } from '../domain/event-store/duplicate-event-seq-error.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { StoredEvent } from '../domain/event-store/stored-event.js';

export type PayloadOf<T extends JanusEventType> = Extract<JanusEvent, { type: T }>['payload'];

export interface RecorderActor {
  readonly agentId: string;
  readonly role: ActorRole;
}

const MAX_SEQ_ATTEMPTS = 100;

/**
 * Appends one actor's events to a run with fresh ULIDs and the next free seq. Several actors
 * (the orchestrator and every session) write to the same run at once: when another one took
 * the seq first, the store rejects the duplicate and the recorder moves past it and retries.
 */
export class RunEventRecorder {
  private seq: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: EventStorePort,
    private readonly runId: string,
    private readonly actor: RecorderActor,
    options: { startSeq?: number; now?: () => Date } = {},
  ) {
    this.seq = options.startSeq ?? 0;
    this.now = options.now ?? (() => new Date());
  }

  /** `cost` goes on the envelope; llm.call events must carry it. */
  async record<T extends JanusEventType>(
    type: T,
    payload: PayloadOf<T>,
    options: { cost?: EventCost } = {},
  ): Promise<void> {
    const id = newUlid();
    const ts = this.now().toISOString();
    for (let attempt = 0; attempt < MAX_SEQ_ATTEMPTS; attempt++) {
      const event = {
        id,
        runId: this.runId,
        seq: this.seq,
        ts,
        schemaVersion: 1,
        actor: { agentId: this.actor.agentId, role: this.actor.role },
        type,
        payload,
        ...(options.cost === undefined ? {} : { cost: options.cost }),
      } as StoredEvent;
      try {
        await this.store.append([event]);
        this.seq += 1;
        return;
      } catch (error) {
        if (!(error instanceof DuplicateEventSeqError)) throw error;
        const taken = await this.store.readRun(this.runId, this.seq);
        this.seq = (taken.at(-1)?.seq ?? this.seq) + 1;
      }
    }
    throw new Error(`Could not find a free seq in run ${this.runId}`);
  }
}
