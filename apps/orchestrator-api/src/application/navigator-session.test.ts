import {
  isKnownEvent,
  type AgentActionEvent,
  type JanusEvent,
  type SessionEndedEvent,
} from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { BudgetExhaustedError } from '../domain/llm/budget-exhausted-error.js';
import { Budget } from '../domain/llm/budget.js';
import { Persona } from '../domain/persona/persona.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { samplePersona } from '../test-support/persona-catalog-contract.js';
import { ScriptedGateway, type ScriptedReply } from '../test-support/scripted-gateway.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { NavigatorSession } from './navigator-session.js';

const RUN_ID = '01JC0F14NAV0000000000000AA';
const BASE_URL = 'http://janus-test-app:3100';
const PASSWORD = 'navigator-secret-7c1d';

// The fake ShopLab pages give these refs, in this order, within one session.
const PURCHASE: ScriptedReply[] = [
  { tool: 'type', input: { ref: 'e1', text: 'Ana Prueba', thought: 'Empiezo por mi nombre.' } },
  { tool: 'type', input: { ref: 'e2', text: 'ana@shoplab.test' } },
  { tool: 'type', input: { ref: 'e3', text: PASSWORD } },
  { tool: 'type', input: { ref: 'e4', text: 'Calle Prueba 1, 28001 Madrid' } },
  { tool: 'click', input: { ref: 'e5' } },
  { tool: 'click', input: { ref: 'e6' } },
  { tool: 'select', input: { ref: 'e7', value: '2' } },
  { tool: 'click', input: { ref: 'e8' } },
  { tool: 'click', input: { ref: 'e9' } },
  { tool: 'click', input: { ref: 'e10' } },
  { tool: 'done', input: { outcome: 'success', reason: 'Pedido hecho.' } },
];

async function run(
  replies: readonly ScriptedReply[],
  options: {
    maxSteps?: number;
    budget?: Budget;
    summaries?: string[];
    details?: Record<string, string>;
  } = {},
) {
  const browser = new ScriptedBrowser(SHOPLAB_PAGES);
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies, options.summaries);
  let tick = 0;
  const session = new NavigatorSession({ browser, gateway, store, now: () => (tick += 100) });
  const result = await session.run({
    runId: RUN_ID,
    agentId: 'ana-0',
    baseUrl: BASE_URL,
    startPath: '/register',
    persona: Persona.create(
      samplePersona('ana', { patience: { maxSteps: options.maxSteps ?? 30, maxSeconds: 600 } }),
    ),
    task: { hasAccount: false, details: options.details ?? { name: 'Ana Prueba' } },
    budget: options.budget ?? new Budget({ maxTokens: 1_000_000, maxEur: 10 }),
  });
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  const ofType = <T extends JanusEvent['type']>(type: T) =>
    events.filter((event): event is Extract<JanusEvent, { type: T }> => event.type === type);
  return { browser, gateway, result, events, ofType };
}

describe('NavigatorSession', () => {
  it('observes, decides and acts until the persona is done, recording every step', async () => {
    const { browser, result, ofType } = await run(PURCHASE);

    expect(result).toEqual({ outcome: 'success', reason: 'Pedido hecho.', steps: 11 });
    expect(browser.selectedValues('scripted-1').get('Cantidad')).toBe('2');
    const actions = ofType('agent.action').map((event: AgentActionEvent) => event.payload);
    expect(actions.map((action) => action.action)).toEqual(
      PURCHASE.map((reply) => 'tool' in reply && reply.tool),
    );
    expect(actions.every((action) => action.ok)).toBe(true);
    expect(ofType('agent.step').map((event) => new URL(event.payload.url).pathname)).toEqual([
      '/register',
      '/register',
      '/register',
      '/register',
      '/register',
      '/',
      '/products/taza-ceramica',
      '/products/taza-ceramica',
      '/cart',
      '/checkout',
      '/orders/7',
    ]);
    const ended = ofType('session.ended') as SessionEndedEvent[];
    expect(ended.map((event) => event.payload)).toEqual([
      {
        outcome: 'success',
        reason: 'Pedido hecho.',
        steps: 11,
        durationMs: expect.any(Number) as number,
      },
    ]);
  });

  it('keeps thoughts as annotations, never in the action', async () => {
    const { events, ofType } = await run(PURCHASE);

    expect(ofType('agent.thought').map((event) => event.payload)).toEqual([
      { stepIndex: 0, text: 'Empiezo por mi nombre.' },
    ]);
    const firstAction = events.find((event) => event.type === 'agent.action');
    expect(JSON.stringify(firstAction)).not.toContain('Empiezo');
  });

  it('sends the same cached prefix every step and never the typed password', async () => {
    const { gateway } = await run(PURCHASE);
    const requests = gateway.actionRequests();

    expect(
      new Set(requests.map(({ system, tools }) => JSON.stringify({ system, tools }))).size,
    ).toBe(1);
    expect(JSON.stringify(gateway.requests)).not.toContain(PASSWORD);
    expect(requests[1]?.messages[0]?.content).toContain('Your last action was carried out.');
  });

  it('remembers which of its details it typed, never the text (F3.6)', async () => {
    const { gateway } = await run(
      [
        { tool: 'type', input: { ref: 'e1', text: 'Ana Prueba' } },
        { tool: 'type', input: { ref: 'e3', text: 'Sintetica2020!' } },
        { tool: 'type', input: { ref: 'e3', text: PASSWORD } },
        { tool: 'done', input: { outcome: 'abandon', reason: 'Stop.' } },
      ],
      {
        details: {
          name: 'Ana Prueba',
          password: PASSWORD,
          'old passwords (try these first, in order)': 'Sintetica2019!, Sintetica2020!',
        },
      },
    );
    const last = JSON.stringify(gateway.actionRequests().at(-1)?.messages ?? []);

    expect(last).toContain('type your name into e1');
    expect(last).toContain('type your old passwords #2 into e3');
    expect(last).toContain('type your password into e3');
    // Only the system prompt holds the details; no step message repeats a typed value.
    const steps = JSON.stringify(gateway.actionRequests().map((request) => request.messages));
    expect(steps).not.toContain(PASSWORD);
    expect(steps).not.toContain('Sintetica2020!');
  });

  it('ends with abandon when the persona gives up', async () => {
    const { result, ofType } = await run([
      { tool: 'done', input: { outcome: 'abandon', reason: 'No me fío de esta web.' } },
    ]);

    expect(result).toEqual({ outcome: 'abandon', reason: 'No me fío de esta web.', steps: 1 });
    expect(ofType('session.ended')[0]?.payload.outcome).toBe('abandon');
  });

  it('ends as patience exhausted when the persona runs out of steps first', async () => {
    const { result, ofType } = await run([{ tool: 'scroll', input: { direction: 'down' } }], {
      maxSteps: 3,
    });

    expect(result).toEqual({ outcome: 'patience_exhausted', steps: 3 });
    expect(ofType('agent.action')).toHaveLength(3);
    expect(ofType('session.ended')[0]?.payload).toMatchObject({ outcome: 'patience_exhausted' });
  });

  it('ends as budget exhausted when the run budget runs out', async () => {
    const budget = new Budget({ maxTokens: 1_000_000, maxEur: 10 });
    const { result, ofType } = await run(
      [
        { tool: 'scroll', input: { direction: 'down' } },
        { throws: new BudgetExhaustedError(budget.snapshot()) },
      ],
      { budget },
    );

    expect(result).toEqual({ outcome: 'budget_exhausted', steps: 1 });
    expect(ofType('session.ended')[0]?.payload.outcome).toBe('budget_exhausted');
  });

  it('treats a reply without a tool call as a failed action the agent sees next', async () => {
    const { gateway, ofType } = await run([
      { text: 'Creo que debería pulsar el botón.' },
      { tool: 'done', input: { outcome: 'abandon', reason: 'x' } },
    ]);

    expect(ofType('agent.action')[0]?.payload).toMatchObject({
      ok: false,
      errorCode: 'action.invalid',
    });
    expect(gateway.actionRequests()[1]?.messages[0]?.content).toContain(
      'Your last action failed (action.invalid)',
    );
  });

  it('remembers the last actions and summarises every 8 steps with the navigator model', async () => {
    const { gateway } = await run([{ tool: 'scroll', input: { direction: 'down' } }], {
      maxSteps: 10,
      summaries: ['Bajé por la página varias veces.'],
    });

    const summaries = gateway.requests.filter((request) => request.tools === undefined);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.role).toBe('navigator');
    const ninth = gateway.actionRequests()[8]?.messages[0]?.content;
    expect(ninth).toContain('What you did so far: Bajé por la página varias veces.');
    expect(ninth).toContain('- step 8: scroll down → ok');
  });
});
