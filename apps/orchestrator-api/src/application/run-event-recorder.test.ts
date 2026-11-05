import { describe, expect, it } from 'vitest';

import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { RunEventRecorder } from './run-event-recorder.js';

const RUN_ID = '01JC0F10RVN00000000000000B';
const step = (stepIndex: number) => ({ stepIndex, url: 'http://janus-x-app:3100/', durationMs: 1 });

describe('RunEventRecorder', () => {
  it('numbers one actor’s events 0, 1, 2…', async () => {
    const store = new InMemoryEventStore();
    const recorder = new RunEventRecorder(store, RUN_ID, { agentId: 'a', role: 'scripted' });

    await recorder.record('agent.step', step(0));
    await recorder.record('agent.step', step(1));

    expect((await store.readRun(RUN_ID)).map((event) => event.seq)).toEqual([0, 1]);
  });

  it('finds the next free seq when other actors write to the same run concurrently', async () => {
    const store = new InMemoryEventStore();
    const recorders = ['a', 'b', 'c'].map(
      (agentId) => new RunEventRecorder(store, RUN_ID, { agentId, role: 'scripted' }),
    );

    await Promise.all(
      recorders.map(async (recorder) => {
        for (let index = 0; index < 5; index++) await recorder.record('agent.step', step(index));
      }),
    );

    const events = await store.readRun(RUN_ID);
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: 15 }, (_, i) => i));
    for (const agentId of ['a', 'b', 'c']) {
      expect(events.filter((event) => event.actor.agentId === agentId)).toHaveLength(5);
    }
  });
});
