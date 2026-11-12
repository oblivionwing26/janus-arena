// Shared contract suite for EventStorePort (CLAUDE.md, architecture rule 6).
// Every adapter, real or in-memory, must pass it unchanged. Not part of the build.

import { randomBytes } from 'node:crypto';

import { InvalidEventError } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { DuplicateEventSeqError } from '../domain/event-store/duplicate-event-seq-error.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { StoredEvent } from '../domain/event-store/stored-event.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Unique ULID-shaped ids so tests never collide, even against a reused database.
export function testUlid(): string {
  let time = Date.now();
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = (CROCKFORD[time % 32] ?? '0') + head;
    time = Math.floor(time / 32);
  }
  const tail = Array.from(randomBytes(16), (byte) => CROCKFORD[byte % 32] ?? '0').join('');
  return head + tail;
}

export function stepEvent(runId: string, seq: number): StoredEvent {
  return {
    id: testUlid(),
    runId,
    seq,
    ts: '2026-11-05T10:00:00.000Z',
    schemaVersion: 1,
    actor: { agentId: 'scripted-buyer', role: 'scripted' },
    type: 'agent.step',
    payload: { stepIndex: seq, url: 'http://shoplab.test/', durationMs: 10 },
  };
}

function seqs(events: readonly StoredEvent[]): number[] {
  return events.map((event) => event.seq);
}

async function take(
  iterable: AsyncIterable<StoredEvent>,
  count: number,
  timeoutMs = 3000,
): Promise<StoredEvent[]> {
  const received: StoredEvent[] = [];
  const collect = (async () => {
    for await (const event of iterable) {
      received.push(event);
      if (received.length === count) break;
    }
  })();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out with ${String(received.length)}/${String(count)} events`));
    }, timeoutMs);
  });
  try {
    await Promise.race([collect, timeout]);
  } finally {
    clearTimeout(timer);
  }
  return received;
}

export interface EventStoreContractHarness {
  /** Returns a store ready to use. Called once per test. */
  create(): Promise<EventStorePort>;
}

export function describeEventStoreContract(name: string, harness: EventStoreContractHarness): void {
  describe(`EventStorePort contract: ${name}`, () => {
    it('reads an empty list for a run with no events', async () => {
      const store = await harness.create();

      expect(await store.readRun(testUlid())).toEqual([]);
    });

    it('treats an empty append as a no-op', async () => {
      const store = await harness.create();

      await expect(store.append([])).resolves.toBeUndefined();
    });

    it('returns events ordered by seq, whatever the append order', async () => {
      const store = await harness.create();
      const runId = testUlid();

      await store.append([stepEvent(runId, 2), stepEvent(runId, 0)]);
      await store.append([stepEvent(runId, 1)]);

      expect(seqs(await store.readRun(runId))).toEqual([0, 1, 2]);
    });

    it('round-trips a known event unchanged, cost included', async () => {
      const store = await harness.create();
      const runId = testUlid();
      const event: StoredEvent = {
        ...stepEvent(runId, 0),
        actor: { agentId: 'persona-ana-1', role: 'navigator' },
        type: 'llm.call',
        payload: { role: 'navigator', model: 'claude-haiku-5-5', durationMs: 900 },
        cost: {
          inputTokens: 1200,
          outputTokens: 80,
          cacheReadInputTokens: 900,
          cacheCreationInputTokens: 0,
          estimatedEur: 0.0021,
        },
      };

      await store.append([event]);

      expect(await store.readRun(runId)).toEqual([event]);
    });

    it('preserves an unknown event with its extra fields', async () => {
      const store = await harness.create();
      const runId = testUlid();
      const event = {
        ...stepEvent(runId, 0),
        type: 'replay.bookmarked',
        payload: { note: 'from the future' },
        extra: { kept: true },
      } as StoredEvent;

      await store.append([event]);

      expect(await store.readRun(runId)).toEqual([event]);
    });

    it('rejects a seq that already exists and keeps the original', async () => {
      const store = await harness.create();
      const runId = testUlid();
      const original = stepEvent(runId, 0);
      await store.append([original]);

      await expect(store.append([stepEvent(runId, 0)])).rejects.toBeInstanceOf(
        DuplicateEventSeqError,
      );
      expect(await store.readRun(runId)).toEqual([original]);
    });

    it('rejects an event its own reads would reject, and stores none of the batch', async () => {
      const store = await harness.create();
      const runId = testUlid();
      // An upper-case agent id once reached the store and made a whole run unreadable (F3.5).
      const invalid = {
        ...stepEvent(runId, 1),
        actor: { agentId: 'Blue-Team', role: 'blue-team' as const },
      };

      await expect(store.append([stepEvent(runId, 0), invalid])).rejects.toBeInstanceOf(
        InvalidEventError,
      );
      expect(await store.readRun(runId)).toEqual([]);
    });

    it('rejects a seq repeated inside one batch and stores nothing', async () => {
      const store = await harness.create();
      const runId = testUlid();

      await expect(
        store.append([stepEvent(runId, 0), stepEvent(runId, 1), stepEvent(runId, 1)]),
      ).rejects.toBeInstanceOf(DuplicateEventSeqError);
      expect(await store.readRun(runId)).toEqual([]);
    });

    it('stores none of a batch when one event clashes with an existing seq', async () => {
      const store = await harness.create();
      const runId = testUlid();
      await store.append([stepEvent(runId, 1)]);

      await expect(store.append([stepEvent(runId, 0), stepEvent(runId, 1)])).rejects.toBeInstanceOf(
        DuplicateEventSeqError,
      );
      expect(seqs(await store.readRun(runId))).toEqual([1]);
    });

    it('reads from fromSeq inclusive', async () => {
      const store = await harness.create();
      const runId = testUlid();
      await store.append([0, 1, 2, 3].map((seq) => stepEvent(runId, seq)));

      expect(seqs(await store.readRun(runId, 2))).toEqual([2, 3]);
      expect(await store.readRun(runId, 10)).toEqual([]);
    });

    it('keeps runs isolated, even with the same seq', async () => {
      const store = await harness.create();
      const runA = testUlid();
      const runB = testUlid();

      await store.append([stepEvent(runA, 0), stepEvent(runB, 0), stepEvent(runB, 1)]);

      expect(seqs(await store.readRun(runA))).toEqual([0]);
      expect(seqs(await store.readRun(runB))).toEqual([0, 1]);
    });

    it('subscribe delivers existing events, then live ones, without gaps or duplicates', async () => {
      const store = await harness.create();
      const runId = testUlid();
      const otherRun = testUlid();
      await store.append([stepEvent(runId, 0), stepEvent(runId, 1)]);

      const received = take(store.subscribe(runId), 4);
      await store.append([stepEvent(otherRun, 0)]);
      await store.append([stepEvent(runId, 2)]);
      await store.append([stepEvent(runId, 3)]);

      expect(seqs(await received)).toEqual([0, 1, 2, 3]);
    });

    it('subscribe starts at fromSeq', async () => {
      const store = await harness.create();
      const runId = testUlid();
      await store.append([0, 1, 2].map((seq) => stepEvent(runId, seq)));

      const received = take(store.subscribe(runId, { fromSeq: 2 }), 2);
      await store.append([stepEvent(runId, 3)]);

      expect(seqs(await received)).toEqual([2, 3]);
    });

    it('subscribe ends when its signal aborts, even while waiting', async () => {
      const store = await harness.create();
      const runId = testUlid();
      await store.append([stepEvent(runId, 0)]);
      const controller = new AbortController();
      const received: StoredEvent[] = [];

      const done = (async () => {
        for await (const event of store.subscribe(runId, { signal: controller.signal })) {
          received.push(event);
          if (received.length === 1)
            setTimeout(() => {
              controller.abort();
            }, 50);
        }
      })();

      await expect(done).resolves.toBeUndefined();
      expect(seqs(received)).toEqual([0]);
    });

    it('lists runs, newest first, with a status derived from their events', async () => {
      const store = await harness.create();
      const running = testUlid();
      const finished = testUlid();
      await store.append([stepEvent(running, 0), stepEvent(running, 1)]);
      await store.append([
        { ...stepEvent(finished, 0), ts: '2026-11-05T11:00:00.000Z' },
        {
          ...stepEvent(finished, 1),
          ts: '2026-11-05T11:00:01.000Z',
          actor: { agentId: 'orchestrator', role: 'orchestrator' },
          type: 'run.completed',
          payload: { outcome: 'error', reason: 'stopped by user' },
        },
      ]);

      const runs = await store.listRuns(1000);
      const byId = new Map(runs.map((run) => [run.runId, run]));

      expect(byId.get(running)).toEqual({
        runId: running,
        startedAt: '2026-11-05T10:00:00.000Z',
        eventCount: 2,
        status: 'running',
        outcome: null,
        reason: null,
      });
      expect(byId.get(finished)).toMatchObject({
        status: 'completed',
        outcome: 'error',
        reason: 'stopped by user',
      });
      const order = runs.map((run) => run.runId);
      expect(order.indexOf(finished)).toBeLessThan(order.indexOf(running));
    });
  });
}
