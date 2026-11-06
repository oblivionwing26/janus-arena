// F1.9: after a session that plays a task, the oracle reads the target as the shopper and
// records task.verified. The agent's own `done` is never the evidence.

import { isKnownEvent, type TaskVerifiedEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Persona } from '../domain/persona/persona.js';
import type { OrderReaderPort } from '../domain/task/order-reader-port.js';
import type { TaskSpec } from '../domain/task/task-spec.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryOrderReader } from '../infrastructure/orders/in-memory-order-reader.js';
import { samplePersona } from '../test-support/persona-catalog-contract.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { NavigatorPrompt } from './navigator-prompt.js';
import { NavigatorSession } from './navigator-session.js';
import { ScriptedDecider } from './scripted-decider.js';

const RUN_ID = '01JC0F19TSK0000000000000AA';
const TASK: TaskSpec = {
  id: 'buy-two-notebooks',
  goal: 'Buy two units of "Cuaderno A5 punteado".',
  expect: { items: [{ product: 'Cuaderno A5 punteado', quantity: 2 }] },
};

async function play(outcome: 'success' | 'abandon', orders: OrderReaderPort) {
  const store = new InMemoryEventStore();
  await new NavigatorSession({ browser: new ScriptedBrowser(SHOPLAB_PAGES), store }).run({
    runId: RUN_ID,
    agentId: 'competent-baseline-a-s1-a1',
    baseUrl: 'http://janus-test-app:3100',
    persona: Persona.create(samplePersona('probe')),
    decider: new ScriptedDecider([{ do: 'done', outcome, reason: 'claimed by the agent' }]),
    verify: { task: TASK, orders },
  });
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  return {
    types: events.map((event) => event.type),
    verified: events.find((event): event is TaskVerifiedEvent => event.type === 'task.verified')
      ?.payload,
  };
}

describe('task verification', () => {
  it('passes when the target has the order the task asks for, after session.ended', async () => {
    const orders = new InMemoryOrderReader();
    orders.set('scripted-1', [
      {
        id: 6,
        items: [{ name: 'Cuaderno A5 punteado', quantity: 2 }],
        discountCents: 0,
        shippingAddress: 'x',
      },
    ]);

    const { types, verified } = await play('success', orders);

    expect(types.slice(-2)).toEqual(['session.ended', 'task.verified']);
    expect(verified).toEqual({
      taskId: 'buy-two-notebooks',
      status: 'passed',
      checks: [{ check: 'quantity of Cuaderno A5 punteado = 2', passed: true }],
      orderId: 6,
    });
  });

  it('fails when the agent claims success but the target disagrees', async () => {
    const orders = new InMemoryOrderReader();
    orders.set('scripted-1', [
      {
        id: 7,
        items: [{ name: 'Cuaderno A5 punteado', quantity: 1 }],
        discountCents: 0,
        shippingAddress: 'x',
      },
    ]);

    const { verified } = await play('success', orders);

    expect(verified?.status).toBe('failed');
    expect(verified?.checks[0]).toMatchObject({ passed: false, detail: 'found 1' });
  });

  it('is unverifiable, not failed, when the target cannot be read', async () => {
    const broken: OrderReaderPort = {
      read: () => Promise.reject(new Error('ShopLab /orders answered 500')),
    };

    const { verified } = await play('abandon', broken);

    expect(verified).toEqual({
      taskId: 'buy-two-notebooks',
      status: 'unverifiable',
      checks: [{ check: 'read the orders', passed: false, detail: 'ShopLab /orders answered 500' }],
    });
  });

  it('gives the agent the task goal instead of the persona goal', () => {
    const persona = Persona.create(samplePersona('probe'));
    const { stable } = NavigatorPrompt.forSession(persona, {
      hasAccount: false,
      details: {},
      goal: TASK.goal,
    }).request({ stepIndex: 0, observation: '', lastResult: null }).system;

    expect(stable).toContain('Buy two units of "Cuaderno A5 punteado".');
    expect(stable).not.toContain(persona.goal);
  });
});
