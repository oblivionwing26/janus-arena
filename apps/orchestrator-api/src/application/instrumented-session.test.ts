// F1.6: the navigator loop records what the runner measures (DOM changes, alerts, technical
// errors, web vitals) and takes a screenshot when a friction signal first appears. The decider
// here is a script, through the same loop the LLM uses.

import { isKnownEvent, type JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Persona } from '../domain/persona/persona.js';
import { InMemoryArtifactStore } from '../infrastructure/artifacts/in-memory-artifact-store.js';
import { ScriptedBrowser, type ScriptedPage } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { samplePersona } from '../test-support/persona-catalog-contract.js';
import { NavigatorSession } from './navigator-session.js';
import {
  ScriptedDecider,
  ScriptIntentNotFoundError,
  type ScriptIntent,
} from './scripted-decider.js';

const RUN_ID = '01JC0F16INS0000000000000AA';
const BASE_URL = 'http://janus-test-app:3100';

const PAGES: Record<string, ScriptedPage> = {
  '/': {
    title: 'Tienda',
    elements: [
      { target: { role: 'link', name: 'Otras opciones' }, inert: true },
      { target: { role: 'button', name: 'Crear cuenta' }, navigatesTo: '/register' },
    ],
    errors: [{ kind: 'http', url: `${BASE_URL}/api/stock`, status: 500, message: 'boom' }],
    vitals: { lcpMs: 4200, cls: 0.01 },
  },
  '/register': {
    title: 'Registro',
    elements: [{ target: { label: 'Email' } }],
    alerts: ['Revisa los campos del formulario.'],
  },
};

async function run(intents: readonly ScriptIntent[]) {
  const store = new InMemoryEventStore();
  const artifacts = new InMemoryArtifactStore();
  const session = new NavigatorSession({
    browser: new ScriptedBrowser(PAGES),
    store,
    artifacts,
  });
  const result = await session.run({
    runId: RUN_ID,
    agentId: 'probe-0',
    baseUrl: BASE_URL,
    persona: Persona.create(samplePersona('probe')),
    decider: new ScriptedDecider(intents),
  });
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  const ofType = <T extends JanusEvent['type']>(type: T) =>
    events.filter((event): event is Extract<JanusEvent, { type: T }> => event.type === type);
  return { result, events, ofType, artifacts };
}

const SCRIPT: ScriptIntent[] = [
  { do: 'click', role: 'link', name: 'Otras opciones' },
  { do: 'click', role: 'button', name: 'Crear cuenta' },
  { do: 'type', field: 'Email', text: 'probe@shoplab.test' },
  { do: 'done', outcome: 'abandon', reason: 'Fin del guion.' },
];

describe('the instrumented navigator loop', () => {
  it('plays a script through the loop as a scripted actor', async () => {
    const { result, events } = await run(SCRIPT);

    expect(result).toEqual({ outcome: 'abandon', reason: 'Fin del guion.', steps: 4 });
    expect(new Set(events.map((event) => event.actor.role))).toEqual(new Set(['scripted']));
  });

  it('records DOM changes per click: none for a dead link', async () => {
    const { ofType } = await run(SCRIPT);

    const clicks = ofType('agent.action').filter((event) => event.payload.action === 'click');
    expect(clicks.map((event) => event.payload.domMutations)).toEqual([0, undefined]);
  });

  it('records alerts, technical errors and web vitals at the step they happened', async () => {
    const { ofType } = await run(SCRIPT);

    expect(ofType('agent.step').map((event) => event.payload.alerts ?? [])).toEqual([
      [],
      [],
      ['Revisa los campos del formulario.'],
      ['Revisa los campos del formulario.'],
    ]);
    expect(
      ofType('page.error').map((event) => [event.payload.stepIndex, event.payload.status]),
    ).toEqual([[0, 500]]);
    expect(ofType('page.vitals')[0]?.payload).toEqual({
      stepIndex: 0,
      url: `${BASE_URL}/`,
      lcpMs: 4200,
      cls: 0.01,
    });
  });

  it('takes one screenshot when a friction signal first appears, and stores it', async () => {
    const { ofType, artifacts } = await run(SCRIPT);

    const shots = ofType('page.screenshot').map((event) => event.payload);
    expect(shots[0]).toMatchObject({
      stepIndex: 0,
      url: `${BASE_URL}/`,
      artifact: 'probe-0/step-0.png',
    });
    expect(['dead-click', 'technical-error', 'performance']).toContain(shots[0]?.detector);
    expect(new Set(shots.map((shot) => shot.stepIndex)).size).toBe(shots.length);
    expect(artifacts.keys(RUN_ID)).toEqual(shots.map((shot) => shot.artifact));
  });

  it('fails clearly when the script names an element the page does not have', async () => {
    await expect(run([{ do: 'click', role: 'button', name: 'Pagar' }])).rejects.toBeInstanceOf(
      ScriptIntentNotFoundError,
    );
  });
});
