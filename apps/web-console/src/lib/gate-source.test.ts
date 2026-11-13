import { newUlid, parseEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { ConsoleEvent } from './console-event';
import { GateEventSource } from './gate-source';

const GATE = '01JC0F320GATE000000000000A';
const CHILD = '01JC0F320CH1D000000000000A';
let clock = 0;

const event = (runId: string, seq: number, type: string, payload: unknown): ConsoleEvent =>
  parseEvent({
    id: newUlid(),
    runId,
    seq,
    ts: new Date(Date.UTC(2026, 10, 13, 10, 0, clock++)).toISOString(),
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type,
    payload,
  });

const sse = (events: readonly ConsoleEvent[]) =>
  events.map((each) => `id: ${String(each.seq)}\ndata: ${JSON.stringify(each)}\n\n`).join('');

/** A fetch that serves each run's current events from `runs`. */
function server(runs: Record<string, ConsoleEvent[]>): typeof fetch {
  return (input) => {
    const id = /runs\/([^/]+)\/events/.exec(String(input))?.[1] ?? '';
    const events = runs[id];
    return Promise.resolve(
      events === undefined ? new Response('', { status: 404 }) : new Response(sse(events)),
    );
  };
}

const collect = (source: GateEventSource) =>
  new Promise<{ batches: ConsoleEvent[][]; ended: boolean }>((resolve, reject) => {
    const batches: ConsoleEvent[][] = [];
    source.start({
      onEvents: (events) => batches.push(events),
      onEnd: () => resolve({ batches, ended: true }),
      onError: reject,
    });
  });

describe('GateEventSource (F3.10)', () => {
  it('merges the gate and the runs its stages started, renumbered in time order', async () => {
    const gate = [
      event(GATE, 0, 'run.started', { budget: { maxTokens: 1, maxEur: 1 } }),
      event(GATE, 1, 'gate.stage', { stage: 'red-team', status: 'run', runId: CHILD }),
    ];
    const child = [
      event(CHILD, 0, 'run.started', { budget: { maxTokens: 1, maxEur: 1 } }),
      event(CHILD, 1, 'run.completed', { outcome: 'success' }),
    ];
    gate.push(event(GATE, 2, 'run.completed', { outcome: 'success' }));

    const { batches } = await collect(
      new GateEventSource(GATE, { fetchImpl: server({ [GATE]: gate, [CHILD]: child }) }),
    );

    const all = batches.flat();
    expect(all.map((each) => each.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(all.map((each) => `${each.runId === GATE ? 'gate' : 'child'}:${each.type}`)).toEqual([
      'gate:run.started',
      'gate:gate.stage',
      'child:run.started',
      'child:run.completed',
      'gate:run.completed',
    ]);
  });

  it('polls a running gate and sends only what is new', async () => {
    const gate = [
      event(GATE, 0, 'run.started', { budget: { maxTokens: 1, maxEur: 1 } }),
      event(GATE, 1, 'gate.stage', { stage: 'red-team', status: 'run', runId: CHILD }),
    ];
    const child = [event(CHILD, 0, 'run.started', { budget: { maxTokens: 1, maxEur: 1 } })];
    const runs = { [GATE]: gate, [CHILD]: child };
    const source = new GateEventSource(GATE, { fetchImpl: server(runs), pollMs: 5 });

    const result = new Promise<ConsoleEvent[][]>((resolve) => {
      const batches: ConsoleEvent[][] = [];
      source.start({
        onEvents: (events) => {
          batches.push(events);
          if (batches.length === 1) {
            // The gate moves on while the console is watching.
            child.push(event(CHILD, 1, 'run.completed', { outcome: 'success' }));
            gate.push(event(GATE, 2, 'run.completed', { outcome: 'success' }));
          }
        },
        onEnd: () => resolve(batches),
      });
    });

    const batches = await result;
    expect(batches.map((batch) => batch.length)).toEqual([3, 2]);
    expect(batches.flat().map((each) => each.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(batches.flat().map((each) => each.id)).size).toBe(5);
  });

  it('is just the run’s own events when it is not a gate, and skips a run that is gone', async () => {
    const lone = [
      event(GATE, 0, 'run.started', { budget: { maxTokens: 1, maxEur: 1 } }),
      event(GATE, 1, 'gate.stage', { stage: 'audit', status: 'run', runId: CHILD }),
      event(GATE, 2, 'run.completed', { outcome: 'success' }),
    ];

    const { batches } = await collect(
      new GateEventSource(GATE, { fetchImpl: server({ [GATE]: lone }) }),
    );

    expect(batches.flat()).toHaveLength(3);
  });

  it('reports an orchestrator that refuses', async () => {
    const source = new GateEventSource(GATE, { fetchImpl: server({}) });

    await expect(collect(source)).rejects.toMatch(/404/);
  });
});
