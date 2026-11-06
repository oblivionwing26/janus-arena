// F1.11, local only (`pnpm test:sandbox`, no API spend): before paying for the A/B run, check
// that the hand-made variant B (janus-shoplab branch variant/manual-b) fixes what it claims.
// A scripted shopper reads the cart as the agent would, applies the coupon without looking for
// it, and the task oracle confirms the discounted order. Needs `docker compose up -d`.

import { isKnownEvent, type TaskVerifiedEvent } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Decider, DecisionInput } from './application/decider.js';
import { NavigatorSession } from './application/navigator-session.js';
import { ScriptedDecider, type ScriptIntent } from './application/scripted-decider.js';
import { Persona } from './domain/persona/persona.js';
import { PlaywrightRunner } from './infrastructure/browser/playwright-runner.js';
import { InMemoryEventStore } from './infrastructure/event-store/in-memory-event-store.js';
import { ShopLabOrderReader } from './infrastructure/orders/shoplab-order-reader.js';
import { DockerCli } from './infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from './infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from './infrastructure/sandbox/workspace.js';
import { samplePersona } from './test-support/persona-catalog-contract.js';

const VARIANT = 'f111';
const RUN_ID = '01JC0F111VB0000000000000AA';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const browser = new PlaywrightRunner();
const store = new InMemoryEventStore();
let baseUrl = '';

/** A scripted decider that also keeps every page it observed. */
class ObservingDecider implements Decider {
  readonly role;
  readonly pages: string[] = [];
  private readonly inner: ScriptedDecider;

  constructor(script: ScriptIntent[]) {
    this.inner = new ScriptedDecider(script);
    this.role = this.inner.role;
  }

  decide(input: DecisionInput) {
    this.pages.push(input.observation.full);
    return this.inner.decide(input);
  }
}

const shopper = new ObservingDecider([
  { do: 'click', role: 'link', name: 'Crear cuenta' },
  { do: 'type', field: 'Nombre', text: 'Sonda B' },
  { do: 'type', field: 'Email', text: 'probe-b@shoplab.test' },
  { do: 'type', field: 'Contraseña (mínimo 8 caracteres)', text: 'probe-password-1' },
  { do: 'type', field: 'Dirección de envío', text: 'Calle Sonda 1, 28001 Madrid' },
  { do: 'click', role: 'button', name: 'Crear cuenta' },
  { do: 'click', role: 'link', name: 'Set de acuarelas (12 colores)' },
  { do: 'click', role: 'button', name: 'Añadir al carrito' },
  // No "Otras opciones": the field is there as soon as the cart is.
  { do: 'type', field: 'Código del cupón', text: 'BIENVENIDA10' },
  { do: 'click', role: 'button', name: 'Aplicar cupón' },
  { do: 'click', role: 'link', name: 'Ir a pagar' },
  { do: 'click', role: 'button', name: 'Confirmar pedido' },
  { do: 'done', outcome: 'success', reason: 'Pedido con cupón.' },
]);
let verified: TaskVerifiedEvent['payload'] | undefined;

beforeAll(async () => {
  ({ baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'variant/manual-b' }));
  await new NavigatorSession({ browser, store }).run({
    runId: RUN_ID,
    agentId: 'probe-variant-b',
    baseUrl,
    persona: Persona.create(
      samplePersona('probe', { patience: { maxSteps: 30, maxSeconds: 600 } }),
    ),
    decider: shopper,
    verify: {
      task: {
        id: 'use-coupon',
        goal: 'Buy one "Set de acuarelas (12 colores)" using your discount coupon BIENVENIDA10.',
        expect: {
          items: [{ product: 'Set de acuarelas (12 colores)', quantity: 1 }],
          discounted: true,
        },
      },
      orders: new ShopLabOrderReader(browser),
    },
  });
  verified = (await store.readRun(RUN_ID))
    .filter(isKnownEvent)
    .find((event): event is TaskVerifiedEvent => event.type === 'task.verified')?.payload;
}, 10 * 60_000);

afterAll(async () => {
  await browser.shutdown();
  await sandbox.down(VARIANT);
}, 60_000);

describe('variant B fixes UX-1 and UX-2 on the cart', () => {
  // The first observation of the cart: right after "Añadir al carrito".
  const cart = () => shopper.pages.find((page) => page.includes('Código del cupón')) ?? '';

  it('UX-1: the cart shows shipping before checkout', () => {
    expect(cart()).toContain('Envío');
  });

  it('UX-2: the coupon form is in sight under its own heading', () => {
    expect(cart()).toContain('¿Tienes un cupón?');
    expect(cart()).not.toContain('Otras opciones');
  });

  it('the coupon applies and the oracle sees a discounted order', () => {
    expect(verified?.status).toBe('passed');
  });
});
