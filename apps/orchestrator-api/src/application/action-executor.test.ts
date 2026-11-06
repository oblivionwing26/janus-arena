import { isKnownEvent, type AgentActionEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { BrowserSessionNotFoundError } from '../domain/browser/browser-errors.js';
import type { RefMap } from '../domain/browser/ref-map.js';
import { ScriptedBrowser, type ScriptedPage } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { ActionExecutor } from './action-executor.js';
import { RunEventRecorder } from './run-event-recorder.js';

const RUN_ID = '01JC0F12ACT0000000000000AA';
const BASE_URL = 'http://janus-test-app:3100';

const PAGES: Record<string, ScriptedPage> = {
  '/': {
    title: 'Tienda',
    elements: [
      { target: { role: 'button', name: 'Comprar' }, navigatesTo: '/cart' },
      { target: { role: 'button', name: 'Comprar' }, navigatesTo: '/checkout' },
      { target: { label: 'Email' } },
      { target: { role: 'combobox', name: 'Cantidad' }, options: ['1', '2'] },
      { target: { role: 'button', name: 'Pagar' }, disabled: true },
      { target: { role: 'button', name: 'Aceptar' }, obscured: true },
      { target: { role: 'link', name: 'Otras opciones' }, inert: true },
      { target: { role: 'button', name: 'Mostrar cupón' } },
    ],
  },
  '/cart': { title: 'Carrito', elements: [] },
  '/checkout': { title: 'Pago', elements: [] },
};

const REFS: RefMap = new Map([
  ['e1', { role: 'button', name: 'Comprar', nth: 0 }],
  ['e2', { role: 'button', name: 'Comprar', nth: 1 }],
  ['e3', { role: 'textbox', name: 'Email', nth: 0 }],
  ['e4', { role: 'combobox', name: 'Cantidad', nth: 0 }],
  ['e5', { role: 'button', name: 'Pagar', nth: 0 }],
  ['e6', { role: 'button', name: 'Aceptar', nth: 0 }],
  ['e7', { role: 'button', name: 'Desaparecido', nth: 0 }],
  ['e8', { role: 'link', name: 'Otras opciones', nth: 0 }],
  ['e9', { role: 'button', name: 'Mostrar cupón', nth: 0 }],
]);

async function setup() {
  const browser = new ScriptedBrowser(PAGES);
  const store = new InMemoryEventStore();
  const recorder = new RunEventRecorder(store, RUN_ID, {
    agentId: 'persona-ana-1',
    role: 'navigator',
  });
  let tick = 0;
  const slept: number[] = [];
  const executor = new ActionExecutor(browser, recorder, {
    now: () => (tick += 5),
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  });
  const session = await browser.newSession({ baseUrl: BASE_URL });
  await browser.goto(session, `${BASE_URL}/`);
  const url = async () => new URL((await browser.snapshot(session)).url).pathname;
  const actions = async () =>
    (await store.readRun(RUN_ID))
      .filter(isKnownEvent)
      .filter((event): event is AgentActionEvent => event.type === 'agent.action')
      .map((event) => event.payload);
  return { browser, session, executor, slept, url, actions };
}

describe('ActionExecutor', () => {
  it('clicks the element a ref points to, nth included, and records it', async () => {
    const { session, executor, url, actions } = await setup();

    const result = await executor.execute(session, { type: 'click', ref: 'e2' }, REFS, 3);

    expect(result).toEqual({ status: 'ok' });
    expect(await url()).toBe('/checkout');
    expect(await actions()).toEqual([
      {
        stepIndex: 3,
        action: 'click',
        ref: 'e2',
        selector: 'role=button[name="Comprar"] nth=1',
        boundingBox: { x: 0, y: 40, width: 200, height: 32 },
        durationMs: 5,
        ok: true,
      },
    ]);
  });

  it('records how many DOM changes a click caused on the same page (F1.6)', async () => {
    const { session, executor, actions } = await setup();

    await executor.execute(session, { type: 'click', ref: 'e8' }, REFS, 0);
    await executor.execute(session, { type: 'click', ref: 'e9' }, REFS, 1);
    await executor.execute(session, { type: 'click', ref: 'e1' }, REFS, 2);

    expect((await actions()).map((action) => action.domMutations)).toEqual([0, 1, undefined]);
  });

  it('types into and selects from the referenced fields', async () => {
    const { browser, session, executor } = await setup();

    await executor.execute(session, { type: 'type', ref: 'e3', text: 'ana@shop.test' }, REFS, 0);
    await executor.execute(session, { type: 'select', ref: 'e4', value: '2' }, REFS, 0);

    expect(browser.typedValues(session).get('Email')).toBe('ana@shop.test');
    expect(browser.selectedValues(session).get('Cantidad')).toBe('2');
  });

  it('scrolls, goes back and waits without a ref', async () => {
    const { session, executor, slept, url, actions } = await setup();
    await executor.execute(session, { type: 'click', ref: 'e1' }, REFS, 0);

    await executor.execute(session, { type: 'back' }, REFS, 1);
    await executor.execute(session, { type: 'scroll', direction: 'down' }, REFS, 1);
    await executor.execute(session, { type: 'wait', ms: 1500 }, REFS, 1);

    expect(await url()).toBe('/');
    expect(slept).toEqual([1500]);
    expect((await actions()).slice(1).map(({ action, ok }) => [action, ok])).toEqual([
      ['back', true],
      ['scroll', true],
      ['wait', true],
    ]);
  });

  it('ends the session on done without touching the browser', async () => {
    const { session, executor, actions } = await setup();

    const result = await executor.execute(
      session,
      { type: 'done', outcome: 'abandon', reason: 'No encuentro el envío' },
      REFS,
      9,
    );

    expect(result).toEqual({ status: 'done', outcome: 'abandon', reason: 'No encuentro el envío' });
    expect((await actions())[0]).toMatchObject({ action: 'done', ok: true });
  });

  it.each([
    [{ type: 'hover', ref: 'e1' }, 'action.invalid', 'hover'],
    [{ ref: 'e1' }, 'action.invalid', 'invalid'],
    [{ type: 'click', ref: 'e99' }, 'action.unknown-ref', 'click'],
    [{ type: 'click', ref: 'e7' }, 'browser.element-not-found', 'click'],
    [{ type: 'click', ref: 'e5' }, 'browser.element-disabled', 'click'],
    [{ type: 'click', ref: 'e6' }, 'browser.element-obscured', 'click'],
    [{ type: 'select', ref: 'e4', value: '9' }, 'browser.option-not-found', 'select'],
  ])('returns %j as a failed result (%s), not an exception', async (raw, code, action) => {
    const { session, executor, url, actions } = await setup();

    const result = await executor.execute(session, raw, REFS, 2);

    expect(result).toMatchObject({ status: 'failed', error: { code } });
    if (result.status === 'failed') expect(result.error.message.length).toBeGreaterThan(0);
    expect(await url()).toBe('/');
    expect(await actions()).toEqual([
      expect.objectContaining({ stepIndex: 2, action, ok: false, errorCode: code }),
    ]);
  });

  it('still throws when the session itself is gone', async () => {
    const { browser, session, executor } = await setup();
    await browser.close(session);

    await expect(
      executor.execute(session, { type: 'scroll', direction: 'up' }, REFS, 0),
    ).rejects.toBeInstanceOf(BrowserSessionNotFoundError);
  });
});
