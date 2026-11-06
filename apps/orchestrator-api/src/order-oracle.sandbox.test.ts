// F1.9, local only (`pnpm test:sandbox`, no API spend): the task oracle reads a real ShopLab
// variant as the shopper and tells a task that was done from one that was not, whatever the
// agent claims. Needs `docker compose up -d` (proxy, browser, browser-relay).

import { isKnownEvent, type TaskVerifiedEvent } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NavigatorSession } from './application/navigator-session.js';
import { ScriptedDecider, type ScriptIntent } from './application/scripted-decider.js';
import { Persona } from './domain/persona/persona.js';
import type { TaskSpec } from './domain/task/task-spec.js';
import { PlaywrightRunner } from './infrastructure/browser/playwright-runner.js';
import { InMemoryEventStore } from './infrastructure/event-store/in-memory-event-store.js';
import { ShopLabOrderReader } from './infrastructure/orders/shoplab-order-reader.js';
import { DockerCli } from './infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from './infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from './infrastructure/sandbox/workspace.js';
import { samplePersona } from './test-support/persona-catalog-contract.js';

const VARIANT = 'f19';
const RUN_ID = '01JC0F19RAC0000000000000AA';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const browser = new PlaywrightRunner();
const store = new InMemoryEventStore();
let baseUrl = '';

const BUY_TWO: TaskSpec = {
  id: 'buy-two-notebooks',
  goal: 'Buy two "Cuaderno A5 punteado".',
  expect: { items: [{ product: 'Cuaderno A5 punteado', quantity: 2 }] },
};

const signUp = (who: string): ScriptIntent[] => [
  { do: 'click', role: 'link', name: 'Crear cuenta' },
  { do: 'type', field: 'Nombre', text: `Oráculo ${who}` },
  { do: 'type', field: 'Email', text: `oracle-${who}@shoplab.test` },
  { do: 'type', field: 'Contraseña (mínimo 8 caracteres)', text: 'oracle-password-1' },
  { do: 'type', field: 'Dirección de envío', text: 'Calle Oráculo 1, 28001 Madrid' },
  { do: 'click', role: 'button', name: 'Crear cuenta' },
];
const buyNotebooks = (quantity: string): ScriptIntent[] => [
  { do: 'click', role: 'link', name: 'Cuaderno A5 punteado' },
  { do: 'select', field: 'Cantidad', value: quantity },
  { do: 'click', role: 'button', name: 'Añadir al carrito' },
  { do: 'click', role: 'link', name: 'Ir a pagar' },
  { do: 'click', role: 'button', name: 'Confirmar pedido' },
  // Both claim success: only the oracle can tell them apart.
  { do: 'done', outcome: 'success', reason: 'Pedido hecho.' },
];

async function play(
  agentId: string,
  script: ScriptIntent[],
): Promise<TaskVerifiedEvent['payload'] | undefined> {
  await new NavigatorSession({ browser, store }).run({
    runId: RUN_ID,
    agentId,
    baseUrl,
    persona: Persona.create(
      samplePersona('oracle', { patience: { maxSteps: 30, maxSeconds: 600 } }),
    ),
    decider: new ScriptedDecider(script, 'competent-baseline'),
    verify: { task: BUY_TWO, orders: new ShopLabOrderReader(browser) },
  });
  return (await store.readRun(RUN_ID))
    .filter(isKnownEvent)
    .find(
      (event): event is TaskVerifiedEvent =>
        event.type === 'task.verified' && event.actor.agentId === agentId,
    )?.payload;
}

beforeAll(async () => {
  ({ baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'main' }));
}, 10 * 60_000);

afterAll(async () => {
  await browser.shutdown();
  await sandbox.down(VARIANT);
}, 60_000);

describe('the task oracle against ShopLab', () => {
  it('passes a session whose order has the two notebooks', async () => {
    const verified = await play('oracle-two-0', [...signUp('two'), ...buyNotebooks('2')]);

    expect(verified?.status).toBe('passed');
    expect(verified?.checks).toEqual([
      { check: 'quantity of Cuaderno A5 punteado = 2', passed: true },
    ]);
    expect(verified?.orderId).toBeGreaterThan(0);
  }, 120_000);

  it('fails a session that bought one, although the agent claimed success', async () => {
    const verified = await play('oracle-one-1', [...signUp('one'), ...buyNotebooks('1')]);

    expect(verified?.status).toBe('failed');
    expect(verified?.checks).toEqual([
      { check: 'quantity of Cuaderno A5 punteado = 2', passed: false, detail: 'found 1' },
    ]);
  }, 120_000);
});
