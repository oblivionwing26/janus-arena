// F1.2 "Done when", local only (`pnpm test:sandbox`): a fixed list of ref-based actions buys
// in a real ShopLab variant through the ActionExecutor. Every step observes the page with the
// ObservationBuilder first, exactly as the navigator agent will (F1.4).
// Needs `docker compose up -d` (proxy, browser, browser-relay, Postgres).

import { ObservationBuilder } from '@janus/observation-builder';
import { isKnownEvent, newUlid, type AgentActionEvent } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ActionExecutor } from './application/action-executor.js';
import { RunEventRecorder } from './application/run-event-recorder.js';
import { PlaywrightRunner } from './infrastructure/browser/playwright-runner.js';
import { PostgresEventStore } from './infrastructure/event-store/postgres-event-store.js';
import { DockerCli } from './infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from './infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from './infrastructure/sandbox/workspace.js';
import { testDatabaseUrl } from './test-support/test-database-url.js';

const VARIANT = 'f12';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const browser = new PlaywrightRunner();
let baseUrl = '';
let store: PostgresEventStore;

beforeAll(async () => {
  ({ baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'main' }));
  store = await PostgresEventStore.connect(testDatabaseUrl());
}, 10 * 60_000);

afterAll(async () => {
  await browser.shutdown();
  await store.close();
  await sandbox.down(VARIANT);
}, 60_000);

interface Step {
  /** Where the page should be before acting. */
  readonly path: RegExp;
  /** Each action, with the observation line its ref must point to. */
  readonly actions: readonly { readonly sees: string; readonly action: unknown }[];
}

// Refs are stable within the session: the header links keep e1–e3 on every page, the shipping
// address field is e9 on both the sign-up and checkout pages, the product link is e25 on the
// catalogue and in the cart.
const PURCHASE: readonly Step[] = [
  {
    path: /\/register$/,
    actions: [
      { sees: '[e6] textbox "Nombre"', action: { type: 'type', ref: 'e6', text: 'Ana Ejecutora' } },
      {
        sees: '[e7] textbox "Email"',
        action: { type: 'type', ref: 'e7', text: 'executor-f12@shoplab.test' },
      },
      {
        sees: '[e8] textbox "Contraseña (mínimo 8 caracteres)"',
        action: { type: 'type', ref: 'e8', text: 'executor-password-1' },
      },
      {
        sees: '[e9] textbox "Dirección de envío"',
        action: { type: 'type', ref: 'e9', text: 'Calle Ejecutor 1, 28001 Madrid' },
      },
      { sees: '[e10] button "Crear cuenta"', action: { type: 'click', ref: 'e10' } },
    ],
  },
  {
    path: /\/$/,
    actions: [
      {
        sees: '[e25] link "Taza de cerámica"',
        action: { type: 'click', ref: 'e25' },
      },
    ],
  },
  {
    path: /\/products\/taza-ceramica$/,
    actions: [
      { sees: '[e26] combobox "Cantidad"', action: { type: 'select', ref: 'e26', value: '2' } },
      { sees: '[e27] button "Añadir al carrito"', action: { type: 'click', ref: 'e27' } },
    ],
  },
  {
    path: /\/cart$/,
    actions: [{ sees: '[e35] link "Ir a pagar"', action: { type: 'click', ref: 'e35' } }],
  },
  {
    path: /\/checkout$/,
    actions: [
      { sees: '[e9] textbox "Dirección de envío"', action: { type: 'scroll', direction: 'down' } },
      { sees: '[e38] button "Confirmar pedido"', action: { type: 'click', ref: 'e38' } },
    ],
  },
  {
    path: /\/orders\/\d+(\?.*)?$/,
    actions: [
      {
        sees: '! status "¡Gracias! Tu pedido se ha realizado correctamente."',
        action: { type: 'done', outcome: 'success', reason: 'Pedido confirmado' },
      },
    ],
  },
];

describe('F1.2 done when', () => {
  it('a fixed list of actions buys in ShopLab through the executor', async () => {
    const runId = newUlid();
    const recorder = new RunEventRecorder(store, runId, {
      agentId: 'fixed-actions',
      role: 'scripted',
    });
    const executor = new ActionExecutor(browser, recorder);
    const builder = new ObservationBuilder();
    const session = await browser.newSession({ baseUrl });

    try {
      await browser.goto(session, `${baseUrl}/register`);
      let last: unknown;
      for (const [stepIndex, step] of PURCHASE.entries()) {
        await browser.waitForUrl(session, step.path);
        for (const { sees, action } of step.actions) {
          const observation = builder.observe(await browser.snapshot(session));
          expect(observation.full, `step ${String(stepIndex)}`).toContain(sees);
          last = await executor.execute(session, action, observation.locators, stepIndex);
          expect(last, JSON.stringify(action)).not.toMatchObject({ status: 'failed' });
        }
      }
      expect(last).toEqual({ status: 'done', outcome: 'success', reason: 'Pedido confirmado' });
    } finally {
      await browser.close(session);
    }

    const actions = (await store.readRun(runId))
      .filter(isKnownEvent)
      .filter((event): event is AgentActionEvent => event.type === 'agent.action');
    expect(actions.map((event) => event.seq)).toEqual(actions.map((_, index) => index));
    expect(actions.map((event) => event.payload.action)).toEqual([
      'type',
      'type',
      'type',
      'type',
      'click',
      'click',
      'select',
      'click',
      'click',
      'scroll',
      'click',
      'done',
    ]);
    expect(actions.every((event) => event.payload.ok)).toBe(true);
    const withRef = actions.filter((event) => event.payload.ref !== undefined);
    expect(withRef).toHaveLength(10);
    for (const { payload } of withRef) {
      expect(payload.selector).toMatch(/^role=/);
      expect(payload.boundingBox?.width).toBeGreaterThan(0);
    }
  }, 120_000);
});
