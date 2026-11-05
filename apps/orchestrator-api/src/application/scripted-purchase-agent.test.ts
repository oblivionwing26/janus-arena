import { isKnownEvent, parseEvent, type JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { ElementNotFoundError } from '../domain/browser/browser-errors.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ScriptedPurchaseAgent } from './scripted-purchase-agent.js';

const RUN_ID = '01JC0F09RVN00000000000000A';
const BASE_URL = 'http://janus-test-app:3100';
const buyer = {
  name: 'Comprador Programado',
  email: 'scripted@shoplab.test',
  password: 'scripted-password-1',
  address: 'Calle Programada 1, 28001 Madrid',
};

function setup(pages = SHOPLAB_PAGES) {
  const browser = new ScriptedBrowser(pages);
  const store = new InMemoryEventStore();
  let tick = 0;
  const recorder = new RunEventRecorder(store, RUN_ID, {
    agentId: 'scripted-buyer',
    role: 'scripted',
  });
  const agent = new ScriptedPurchaseAgent(browser, recorder, () => (tick += 10));
  return { browser, store, agent };
}

function known(events: unknown[]): JanusEvent[] {
  return events.map((event) => {
    const parsed = parseEvent(event);
    if (!isKnownEvent(parsed)) throw new Error(`unknown event ${parsed.type}`);
    return parsed;
  });
}

describe('ScriptedPurchaseAgent', () => {
  it('buys from sign-up to the order page', async () => {
    const { browser, agent } = setup();

    const result = await agent.run({ baseUrl: BASE_URL, buyer });

    expect(result.orderUrl).toBe(`${BASE_URL}/orders/7`);
    expect(result.steps).toBe(6);
    expect(browser.typedValues('scripted-1').get('Email')).toBe(buyer.email);
  });

  it('records valid agent.step and agent.action events with consecutive seq', async () => {
    const { store, agent } = setup();

    await agent.run({ baseUrl: BASE_URL, buyer });

    const events = known(await store.readRun(RUN_ID));
    expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index));
    expect(events.every((event) => event.actor.agentId === 'scripted-buyer')).toBe(true);
    const steps = events.filter((event) => event.type === 'agent.step');
    expect(steps.map((event) => new URL(event.payload.url).pathname)).toEqual([
      '/',
      '/products/taza-ceramica',
      '/cart',
      '/checkout',
      '/orders/7',
      '/orders/7',
    ]);
    expect(steps.every((event) => event.payload.durationMs > 0)).toBe(true);
  });

  it('records each action before its step, in order', async () => {
    const { store, agent } = setup();

    await agent.run({ baseUrl: BASE_URL, buyer });

    const events = known(await store.readRun(RUN_ID));
    const firstStep = events.findIndex((event) => event.type === 'agent.step');
    const signUp = events.slice(0, firstStep);
    expect(
      signUp.map((event) => (event.type === 'agent.action' ? event.payload.action : event.type)),
    ).toEqual(['goto', 'type', 'type', 'type', 'type', 'click', 'wait']);
    expect(signUp.every((event) => event.type === 'agent.action' && event.payload.ok)).toBe(true);
  });

  it('stops between actions when its signal aborts and closes the session', async () => {
    const { store, agent, browser } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(
      agent.run({ baseUrl: BASE_URL, buyer, signal: controller.signal }),
    ).rejects.toThrow();

    expect(await store.readRun(RUN_ID)).toEqual([]);
    await expect(browser.snapshot('scripted-1')).rejects.toThrow(/closed/);
  });

  it('records the failed action and stops when an element is missing', async () => {
    const pages = { ...SHOPLAB_PAGES, '/cart': { title: 'ShopLab', elements: [] } };
    const { store, agent } = setup(pages);

    await expect(agent.run({ baseUrl: BASE_URL, buyer })).rejects.toBeInstanceOf(
      ElementNotFoundError,
    );

    const events = known(await store.readRun(RUN_ID));
    const last = events.at(-1);
    expect(last?.type).toBe('agent.action');
    expect(last?.type === 'agent.action' && last.payload).toMatchObject({
      action: 'click',
      ok: false,
      selector: 'role=link[name="Ir a pagar"]',
    });
  });
});
