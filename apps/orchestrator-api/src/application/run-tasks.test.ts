// A baseline-only run over tasks (F1.9), end to end with in-memory adapters: each task is its
// own session, the baseline gets the task's goal, and the oracle verifies every session.

import { CANARY_CHECK, isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { canaryFor } from '../domain/task/canary.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryOrderReader } from '../infrastructure/orders/in-memory-order-reader.js';
import { InMemoryShopperAccounts } from '../infrastructure/personas/in-memory-shopper-accounts.js';
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
      orders: { shoplab: orders },
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

describe('a run on another target (F3.5a)', () => {
  it('uses that target’s order reader and synthetic shopper details', async () => {
    const store = new InMemoryEventStore();
    const sandbox = new InMemorySandbox();
    const queue = new InMemorySessionQueue({ autoRun: true, concurrency: 1 });
    const control = new RunControl();
    const personas = new InMemoryPersonaCatalog([
      samplePersona('competent-baseline', {
        modelRole: 'competent-baseline',
        biases: [],
        digitalLiteracy: 5,
      }),
    ]);
    const shoplabOrders = new InMemoryOrderReader();
    const juiceOrders = new InMemoryOrderReader();
    const accounts = new InMemoryShopperAccounts();
    juiceOrders.set('scripted-1', [
      {
        id: '5267-f9cd5882f54c75a3',
        items: [{ name: 'Apple Juice (1000ml)', quantity: 1 }],
        discountCents: 0,
        shippingAddress: 'Calle Sintética 1, 28001 Madrid',
      },
    ]);
    const gateway = new ScriptedGateway([
      { tool: 'done', input: { outcome: 'success', reason: 'Done.' } },
    ]);
    const runSession = new RunAgentSession({
      store,
      browser: new ScriptedBrowser(SHOPLAB_PAGES),
      control,
      navigator: { gateway, personas },
      orders: { shoplab: shoplabOrders, 'juice-shop': juiceOrders },
      shoppers: {
        'juice-shop': {
          emailDomain: 'janus.test',
          details: { 'card number': '4111111111111111', city: 'Madrid' },
          account: 'preregistered',
          savedCheckout: true,
        },
      },
      accounts: { 'juice-shop': accounts },
    });
    const finishRun = new FinishRun({ store, sandbox, control });
    void queue.start({
      runSession: (job) => runSession.execute(job),
      finishRun: (plan, results) => finishRun.execute(plan, results),
    });
    const { runId, launched } = await new StartRun({
      store,
      sandbox,
      queue,
      control,
      personas,
    }).execute(
      runInputFromConfig({
        target: 'juice-shop',
        variants: [{ key: 'a', ref: 'image' }],
        personas: [],
        seeds: [1],
        tasks: [
          {
            id: 'buy-apple-juice',
            goal: 'Buy one "Apple Juice (1000ml)".',
            expect: { items: [{ product: 'Apple Juice (1000ml)', quantity: 1 }] },
          },
        ],
        budget: { maxTokens: 1_000_000, maxEur: 1 },
      }),
    );
    await launched;
    await queue.drain();

    const verified = (await store.readRun(runId))
      .filter(isKnownEvent)
      .flatMap((event) => (event.type === 'task.verified' ? [event.payload] : []));
    expect(verified).toMatchObject([{ status: 'passed', orderId: '5267-f9cd5882f54c75a3' }]);
    const prompt = gateway.actionRequests()[0]?.system.stable ?? '';
    expect(prompt).toContain('@janus.test');
    expect(prompt).toContain('- card number: 4111111111111111');
    expect(prompt).not.toContain('@shoplab.test');
    // The account exists before the session; the shopper is told so and signs in itself.
    expect(accounts.created.map((each) => each.email)).toEqual([
      expect.stringMatching(/^competent-baseline-t1-s1-.*@janus\.test$/),
    ]);
    expect(prompt).toContain('You already have an account in this shop');
    // Its address and card are saved in it, so the session measures finding and paying.
    expect(accounts.created.map((each) => each.saveCheckout)).toEqual([true]);
    expect(prompt).toContain('Your home address and card are already saved in that account.');
  });
});

describe('a persona who forgets their password (F3.6)', () => {
  it('gets old passwords to try first, in order, and is told to', async () => {
    const store = new InMemoryEventStore();
    const sandbox = new InMemorySandbox();
    const queue = new InMemorySessionQueue({ autoRun: true, concurrency: 1 });
    const control = new RunControl();
    const personas = new InMemoryPersonaCatalog([
      samplePersona('ines-forgetful', { biases: ['forgets-password'] }),
      samplePersona('competent-baseline', {
        modelRole: 'competent-baseline',
        biases: [],
        digitalLiteracy: 5,
      }),
    ]);
    const gateway = new ScriptedGateway([
      { tool: 'done', input: { outcome: 'abandon', reason: 'Stop.' } },
    ]);
    const runSession = new RunAgentSession({
      store,
      browser: new ScriptedBrowser(SHOPLAB_PAGES),
      control,
      navigator: { gateway, personas },
    });
    const finishRun = new FinishRun({ store, sandbox, control });
    void queue.start({
      runSession: (job) => runSession.execute(job),
      finishRun: (plan, results) => finishRun.execute(plan, results),
    });
    const { launched } = await new StartRun({ store, sandbox, queue, control, personas }).execute(
      runInputFromConfig({
        target: 'shoplab',
        variants: [{ key: 'a', ref: 'main' }],
        personas: ['ines-forgetful'],
        seeds: [1],
        budget: { maxTokens: 1_000_000, maxEur: 1 },
      }),
    );
    await launched;
    await queue.drain();

    const prompt =
      gateway
        .actionRequests()
        .map((request) => request.system.stable)
        .find((stable) => stable.includes('forgets') || stable.includes('old passwords')) ?? '';
    expect(prompt).toContain('you try your old passwords first, in the order listed');
    expect(prompt).toMatch(
      /- old passwords \(try these first, in order\): Sintetica2019!, Sintetica2020!, Sintetica2021!, Sintetica2022!, Sintetica2023!\n/,
    );
    // The right one is still there, last to try.
    expect(prompt).toMatch(/- password: \S+/);
  });
});

describe('canary accounts in a Launch Day run (F4.1)', () => {
  const RUN_ID = '01JC0F28CNS0000000000000AA';
  const agent = (task: number) => `competent-baseline-a-t${String(task)}-s1-a1`;

  it('marks each shopper’s address and checks that no order carries another one’s mark', async () => {
    const store = new InMemoryEventStore();
    const sandbox = new InMemorySandbox();
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
    const mug = (id: number, address: string) => ({
      id,
      items: [{ name: 'Taza de cerámica', quantity: 1 }],
      discountCents: 0,
      shippingAddress: address,
    });
    // The first shopper reads its own order; the second reads one with the first one's mark.
    orders.set('scripted-1', [mug(6, `Calle Sintética 1 ${canaryFor(RUN_ID, agent(1))}`)]);
    orders.set('scripted-2', [mug(7, `Calle Sintética 1 ${canaryFor(RUN_ID, agent(1))}`)]);
    const gateway = new ScriptedGateway([
      { tool: 'done', input: { outcome: 'success', reason: 'Hecho.' } },
    ]);
    const runSession = new RunAgentSession({
      store,
      browser: new ScriptedBrowser(SHOPLAB_PAGES),
      control,
      navigator: { gateway, personas },
      orders: { shoplab: orders },
    });
    const finishRun = new FinishRun({ store, sandbox, control });
    void queue.start({
      runSession: (job) => runSession.execute(job),
      finishRun: (plan, results) => finishRun.execute(plan, results),
    });
    const startRun = new StartRun({
      store,
      sandbox,
      queue,
      control,
      personas,
      newRunId: () => RUN_ID,
    });

    const { runId, launched } = await startRun.execute(
      runInputFromConfig({
        target: 'shoplab',
        variants: [{ key: 'a', ref: 'main' }],
        personas: [],
        seeds: [1],
        tasks,
        clientIps: { mode: 'distinct' },
        budget: { maxTokens: 1_000_000, maxEur: 1 },
      }),
    );
    await launched;
    await queue.drain();

    const events = (await store.readRun(runId)).filter(isKnownEvent);
    const verified = events.flatMap((event) => (event.type === 'task.verified' ? [event] : []));
    const canaryChecks = verified.map((event) => [
      event.actor.agentId,
      event.payload.checks.find((check) => check.check === CANARY_CHECK)?.passed,
    ]);
    expect(canaryChecks).toEqual([
      [agent(1), true],
      [agent(2), false],
    ]);
    // Contamination is read apart from success: the second order is wrong for another reason only.
    expect(verified.map((event) => event.payload.status)).toEqual(['passed', 'failed']);
    // The shopper was told its address with the mark, to type it in the form.
    const told = JSON.stringify(gateway.actionRequests()[0]);
    expect(told).toContain(canaryFor(RUN_ID, agent(1)));
  });

  it('leaves a run without client addresses as it was, with no canary and no extra check', async () => {
    const store = new InMemoryEventStore();
    const sandbox = new InMemorySandbox();
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
    orders.set('scripted-1', [
      {
        id: 1,
        items: [{ name: 'Taza de cerámica', quantity: 1 }],
        discountCents: 0,
        shippingAddress: 'x',
      },
    ]);
    const gateway = new ScriptedGateway([
      { tool: 'done', input: { outcome: 'success', reason: 'Hecho.' } },
    ]);
    const runSession = new RunAgentSession({
      store,
      browser: new ScriptedBrowser(SHOPLAB_PAGES),
      control,
      navigator: { gateway, personas },
      orders: { shoplab: orders },
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
        tasks: tasks.slice(0, 1),
        budget: { maxTokens: 1_000_000, maxEur: 1 },
      }),
    );
    await launched;
    await queue.drain();

    const verified = (await store.readRun(runId))
      .filter(isKnownEvent)
      .flatMap((event) => (event.type === 'task.verified' ? [event] : []));
    expect(verified[0]?.payload.checks.map((check) => check.check)).not.toContain(CANARY_CHECK);
    expect(JSON.stringify(gateway.actionRequests()[0])).not.toContain('CNR-');
  });
});
