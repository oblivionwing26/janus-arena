import {
  newUlid,
  type ActorRole,
  type JanusEvent,
  type JanusEventType,
} from '@janus/shared-kernel';

import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { StoredEvent } from '../domain/event-store/stored-event.js';

export type PayloadOf<T extends JanusEventType> = Extract<JanusEvent, { type: T }>['payload'];

export interface RecorderActor {
  readonly agentId: string;
  readonly role: ActorRole;
}

/**
 * Appends one actor's events to a run with consecutive seq numbers and fresh ULIDs.
 * One recorder per run and actor; seq allocation across concurrent actors is F0.10's job.
 */
export class RunEventRecorder {
  private seq: number;

  constructor(
    private readonly store: EventStorePort,
    private readonly runId: string,
    private readonly actor: RecorderActor,
    options: { startSeq?: number; now?: () => Date } = {},
  ) {
    this.seq = options.startSeq ?? 0;
    this.now = options.now ?? (() => new Date());
  }

  private readonly now: () => Date;

  async record<T extends JanusEventType>(type: T, payload: PayloadOf<T>): Promise<void> {
    const event = {
      id: newUlid(),
      runId: this.runId,
      seq: this.seq,
      ts: this.now().toISOString(),
      schemaVersion: 1,
      actor: { agentId: this.actor.agentId, role: this.actor.role },
      type,
      payload,
    } as StoredEvent;
    await this.store.append([event]);
    this.seq += 1;
  }
}
