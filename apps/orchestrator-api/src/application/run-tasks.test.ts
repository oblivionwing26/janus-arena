// A baseline-only run over tasks (F1.9), end to end with in-memory adapters: each task is its
// own session, the baseline gets the task's goal, and the oracle verifies every session.

import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryOrderReader } from '../infrastructure/orders/in-memory-order-reader.js';
import { InMemoryPersonaCatalog } from '../infrastructure/personas/in-memory-persona-catalog.js';
import { InMemorySessionQueue } from '../infrastructure/queue/in-memory-session-queue.js';
import { InMemorySandbox } from '../infrastructure/sandbox/in-memory-sandbox.js';
import { samplePersona } from '../test-support/persona-catalog-contract.js';
import { ScriptedGateway } from '../test-support/scripted-gateway.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { FinishRun } from './finish-run.js';
import { RunAgentSession } from './run-agent-session.js';
import { RunControl } from './run-control.js';
import { runInputFromConfig, StartRun } from './start-run.js';

const tasks = [
  {
    id: 'buy-mug',
    goal: 'Buy one "Taza de cerámica".',
    expect: { items: [{ product: 'Taza de cerámica', quantity: 1 }] },
  },
  {
    id: 'buy-two-notebooks',
    goal: 'Buy two "Cuaderno A5 punteado".',
    expect: { items: [{ product: 'Cuaderno A5 punteado', quantity: 2 }] },
  },
];

describe('a baseline-only run over tasks', () => {
  it('plays each task as its own session and records what the oracle found', async () => {
    const store = new InMemoryEventStore();
    const sandbox = new InMemorySandbox();
    // One session at a time, so the fake browser's session ids follow the matrix order.
    const queue = new InMemorySessionQueue({ autoRun: true, concurrency: 1 });
    const control = new RunControl();
    const personas = new InMemoryPersonaCatalog([
      samplePersona('competent-baseline', {
        modelRole: 'competent-baseline',
        biases: [],
        digitalLiteracy: 5,
      }),
    ]);
    const orders = new InMemoryOrderReader();
    // Both shoppers bought a mug: right for the first task, wrong for the second.
    const mug = {
      id: 6,
      items: [{ name: 'Taza de cerámica', quantity: 1 }],
      discountCents: 0,
      shippingAddress: 'x',
    };
    orders.set('scripted-1', [mug]);
    orders.set('scripted-2', [{ ...mug, id: 7 }]);
    const gateway = new ScriptedGateway([
      { tool: 'done', input: { outcome: 'success', reason: 'Hecho.' } },
    ]);
    const runSession = new RunAgentSession({
      store,
      browser: new ScriptedBrowser(SHOPLAB_PAGES),
      control,
      navigator: { gateway, personas },
      orders,
    });
    const finishRun = new FinishRun({ store, sandbox, control });
    void queue.start({
      runSession: (job) => runSession.execute(job),
      finishRun: (plan, results) => finishRun.execute(plan, results),
    });
    const startRun = new StartRun({ store, sandbox, queue, control, personas });

    const { runId, launched } = await startRun.execute(
      runInputFromConfig({
        target: 'shoplab',
        variants: [{ key: 'a', ref: 'main' }],
        personas: [],
        seeds: [1],
        tasks,
        budget: { maxTokens: 1_000_000, maxEur: 1 },
      }),
    );
    await launched;
    await queue.drain();

    const events = (await store.readRun(runId)).filter(isKnownEvent);
    const started = events.flatMap((event) => (event.type === 'session.started' ? [event] : []));
    expect(started.map((event) => [event.actor.agentId, event.payload.task])).toEqual([
      ['competent-baseline-a-t1-s1-a1', 'buy-mug'],
      ['competent-baseline-a-t2-s1-a1', 'buy-two-notebooks'],
    ]);
    const verified = events.flatMap((event) => (event.type === 'task.verified' ? [event] : []));
    expect(verified.map((event) => [event.actor.agentId, event.payload.status])).toEqual([
      ['competent-baseline-a-t1-s1-a1', 'passed'],
      ['competent-baseline-a-t2-s1-a1', 'failed'],
    ]);
    // The baseline read the task's goal, not its persona's.
    expect(gateway.actionRequests()[1]?.system.stable).toContain('Buy two "Cuaderno A5 punteado".');
  });
});
