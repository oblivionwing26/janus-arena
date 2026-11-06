// F1.6 "Done when", local only (`pnpm test:sandbox`, no API spend): each flaw seeded in ShopLab
// (janus-shoplab UX_FLAWS.md) produces at least one friction signal with a scripted agent.
// Each probe follows the flaw's "Reproduce" steps and behaves the way a confused shopper would;
// it runs through the same instrumented loop as the LLM, and the friction engine decides.
// Needs `docker compose up -d` (proxy, browser, browser-relay).
// F1.10 "Done when" runs on the same sessions: with the signals recorded, the three flaws are
// among the heatmap's 5 most intense zones. JANUS_WRITE_FIXTURE=1 saves the run as the
// regression fixture of packages/synthlab-report.

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectFriction, type FrictionSignalDraft } from '@janus/friction-engine';
import { buildRunExport, isKnownEvent, type FrictionZone } from '@janus/shared-kernel';
import { frictionZones } from '@janus/synthlab-report';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NavigatorSession } from './application/navigator-session.js';
import { RunEventRecorder } from './application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from './application/start-run.js';
import { ScriptedDecider, type ScriptIntent } from './application/scripted-decider.js';
import { Persona } from './domain/persona/persona.js';
import { FileArtifactStore } from './infrastructure/artifacts/file-artifact-store.js';
import { PlaywrightRunner } from './infrastructure/browser/playwright-runner.js';
import { InMemoryEventStore } from './infrastructure/event-store/in-memory-event-store.js';
import { DockerCli } from './infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from './infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from './infrastructure/sandbox/workspace.js';
import { samplePersona } from './test-support/persona-catalog-contract.js';

const VARIANT = 'f16';
const RUN_ID = '01JC0F16FXF0000000000000AA';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const browser = new PlaywrightRunner();
const store = new InMemoryEventStore();
let artifacts: FileArtifactStore;
let baseUrl = '';
let signals: FrictionSignalDraft[] = [];
let zones: FrictionZone[] = [];

const signUp = (who: string): ScriptIntent[] => [
  { do: 'click', role: 'link', name: 'Crear cuenta' },
  { do: 'type', field: 'Nombre', text: `Sonda ${who}` },
  { do: 'type', field: 'Email', text: `probe-${who}@shoplab.test` },
  { do: 'type', field: 'Contraseña (mínimo 8 caracteres)', text: 'probe-password-1' },
  { do: 'type', field: 'Dirección de envío', text: 'Calle Sonda 1, 28001 Madrid' },
  { do: 'click', role: 'button', name: 'Crear cuenta' },
];
const toCart: ScriptIntent[] = [
  { do: 'click', role: 'link', name: 'Taza de cerámica' },
  { do: 'click', role: 'button', name: 'Añadir al carrito' },
];
const applyCoupon: ScriptIntent[] = [
  { do: 'click', role: 'link', name: 'Otras opciones' },
  { do: 'type', field: 'Código del cupón', text: 'BIENVENIDA10' },
  { do: 'click', role: 'button', name: 'Aplicar cupón' },
];

const PROBES: {
  agentId: string;
  role?: 'competent-baseline';
  startPath?: string;
  script: ScriptIntent[];
}[] = [
  {
    // UX-1: the total jumps at checkout; the shopper goes back to the cart and gives up.
    agentId: 'probe-ux1-0',
    script: [
      ...signUp('ux1'),
      ...toCart,
      { do: 'click', role: 'link', name: 'Ir a pagar' },
      { do: 'back' },
      { do: 'done', outcome: 'abandon', reason: 'El envío solo aparece al pagar.' },
    ],
  },
  {
    // UX-2 reference: a competent shopper who knows where the coupon is.
    agentId: 'baseline-ux2-1',
    role: 'competent-baseline',
    script: [
      ...signUp('ux2b'),
      ...toCart,
      ...applyCoupon,
      { do: 'done', outcome: 'success', reason: 'Cupón aplicado.' },
    ],
  },
  {
    // UX-2: looking for the coupon field before guessing "Otras opciones".
    agentId: 'probe-ux2-2',
    script: [
      ...signUp('ux2'),
      ...toCart,
      { do: 'scroll', direction: 'down' },
      { do: 'scroll', direction: 'up' },
      { do: 'click', role: 'link', name: 'Ir a pagar' },
      { do: 'click', role: 'link', name: 'Carrito' },
      { do: 'scroll', direction: 'down' },
      { do: 'scroll', direction: 'up' },
      ...applyCoupon,
      { do: 'done', outcome: 'success', reason: 'Por fin encontré el cupón.' },
    ],
  },
  {
    // UX-3: a short password clears the whole sign-up form; the shopper types it all again.
    agentId: 'probe-ux3-3',
    startPath: '/register',
    script: [
      { do: 'type', field: 'Nombre', text: 'Sonda ux3' },
      { do: 'type', field: 'Email', text: 'probe-ux3@shoplab.test' },
      { do: 'type', field: 'Contraseña (mínimo 8 caracteres)', text: 'corta' },
      { do: 'type', field: 'Dirección de envío', text: 'Calle Sonda 1, 28001 Madrid' },
      { do: 'click', role: 'button', name: 'Crear cuenta' },
      { do: 'type', field: 'Nombre', text: 'Sonda ux3' },
      { do: 'type', field: 'Email', text: 'probe-ux3@shoplab.test' },
      { do: 'type', field: 'Contraseña (mínimo 8 caracteres)', text: 'corta2' },
      { do: 'type', field: 'Dirección de envío', text: 'Calle Sonda 1, 28001 Madrid' },
      { do: 'click', role: 'button', name: 'Crear cuenta' },
      { do: 'done', outcome: 'abandon', reason: 'Se me borra todo cada vez.' },
    ],
  },
];

beforeAll(async () => {
  ({ baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'main' }));
  artifacts = new FileArtifactStore(await mkdtemp(join(tmpdir(), 'janus-f16-')));
  const persona = Persona.create(
    samplePersona('probe', { patience: { maxSteps: 40, maxSeconds: 600 } }),
  );
  for (const probe of PROBES) {
    await new NavigatorSession({ browser, store, artifacts }).run({
      runId: RUN_ID,
      agentId: probe.agentId,
      baseUrl,
      persona,
      ...(probe.startPath === undefined ? {} : { startPath: probe.startPath }),
      decider: new ScriptedDecider(probe.script, probe.role ?? 'scripted'),
    });
  }
  signals = detectFriction(await store.readRun(RUN_ID));
  console.log(
    signals
      .map(
        (s) =>
          `${s.agentId} ${s.detector} ${s.severity} step=${String(s.stepIndex)} ${s.url ?? ''}`,
      )
      .join('\n'),
  );

  // As FinishRun does at the end of a run (F1.6), then the heatmap's zones (F1.10).
  const recorder = new RunEventRecorder(store, RUN_ID, ORCHESTRATOR_ACTOR);
  for (const signal of signals) {
    await recorder.record('friction.signal', {
      detector: signal.detector,
      severity: signal.severity,
      evidenceEventIds: [...signal.evidenceEventIds],
      agentId: signal.agentId,
      ...(signal.stepIndex === undefined ? {} : { stepIndex: signal.stepIndex }),
      ...(signal.url === undefined ? {} : { url: signal.url }),
    });
  }
  const events = await store.readRun(RUN_ID);
  zones = frictionZones(events, { routes: ['/products/:slug', '/orders/:id'], top: 5 });
  console.log(
    zones
      .map(
        (zone) =>
          `${String(zone.rank)}. ${zone.route} ${zone.element ?? '(page)'} ${String(zone.intensity)} ${zone.detectors.map((entry) => entry.detector).join(',')}`,
      )
      .join('\n'),
  );
  if (process.env.JANUS_WRITE_FIXTURE === '1') {
    await writeFile(
      new URL('../../../packages/synthlab-report/fixtures/flaw-probes-f110.json', import.meta.url),
      `${JSON.stringify(buildRunExport(RUN_ID, events), null, 2)}\n`,
    );
  }
}, 15 * 60_000);

afterAll(async () => {
  await browser.shutdown();
  await sandbox.down(VARIANT);
}, 60_000);

const detectorsOf = (agentId: string) =>
  new Set(signals.filter((signal) => signal.agentId === agentId).map((signal) => signal.detector));

describe('F1.6 done when: every seeded ShopLab flaw produces a friction signal', () => {
  it('UX-1 (shipping only at checkout): going back from checkout is a backtrack', () => {
    expect(detectorsOf('probe-ux1-0')).toContain('backtrack');
  });

  it('UX-2 (hidden coupon): searching for it takes extra steps against the baseline', () => {
    expect(detectorsOf('probe-ux2-2')).toContain('extra-steps');
    expect(detectorsOf('baseline-ux2-1').has('extra-steps')).toBe(false);
  });

  it('UX-3 (sign-up form cleared on error): the validation error is a form error', () => {
    expect(detectorsOf('probe-ux3-3')).toContain('form-error');
  });

  it('measured what the engine needs: DOM changes, alerts and vitals', async () => {
    const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
    const reveal = events.find(
      (event) =>
        event.type === 'agent.action' &&
        event.actor.agentId === 'baseline-ux2-1' &&
        event.payload.selector === 'role=link[name="Otras opciones"]',
    );
    expect(reveal?.type === 'agent.action' && (reveal.payload.domMutations ?? 0) > 0).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'agent.step' && (event.payload.alerts ?? []).length > 0,
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === 'page.vitals')).toBe(true);
  });

  it('saved a screenshot for each step where a signal first appeared', async () => {
    const shots = (await store.readRun(RUN_ID))
      .filter(isKnownEvent)
      .flatMap((event) => (event.type === 'page.screenshot' ? [event.payload] : []));
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      const png = await artifacts.get(RUN_ID, shot.artifact);
      expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

describe('F1.10 done when: the three seeded flaws are among the 5 hottest zones', () => {
  const zoneOf = (route: string, detector: string) =>
    zones.find(
      (zone) => zone.route === route && zone.detectors.some((entry) => entry.detector === detector),
    );

  it('UX-1: the checkout page the shopper went back from', () => {
    expect(zoneOf('/checkout', 'backtrack')).toBeDefined();
  });

  it('UX-2: the cart, where the coupon search costs extra steps', () => {
    expect(zoneOf('/cart', 'extra-steps')).toBeDefined();
  });

  it('UX-3: the sign-up button whose validation error clears the form', () => {
    expect(zoneOf('/register', 'form-error')?.element).toBe('role=button[name="Crear cuenta"]');
  });
});
