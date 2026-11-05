import {
  describeTarget,
  type BrowserPort,
  type ElementTarget,
} from '../domain/browser/browser-port.js';
import type { RunEventRecorder } from './run-event-recorder.js';

export interface Buyer {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly address: string;
}

export interface ScriptedPurchaseInput {
  readonly baseUrl: string;
  readonly buyer: Buyer;
}

type Action =
  | { readonly kind: 'goto'; readonly path: string }
  | { readonly kind: 'type'; readonly target: ElementTarget; readonly text: string }
  | { readonly kind: 'click'; readonly target: ElementTarget }
  | { readonly kind: 'wait'; readonly url: RegExp }
  | { readonly kind: 'snapshot' };

interface Step {
  readonly actions: readonly Action[];
}

const PRODUCT = 'Taza de cerámica';

function purchaseSteps(buyer: Buyer): Step[] {
  return [
    {
      actions: [
        { kind: 'goto', path: '/register' },
        { kind: 'type', target: { label: 'Nombre' }, text: buyer.name },
        { kind: 'type', target: { label: 'Email' }, text: buyer.email },
        {
          kind: 'type',
          target: { label: 'Contraseña (mínimo 8 caracteres)' },
          text: buyer.password,
        },
        { kind: 'type', target: { label: 'Dirección de envío' }, text: buyer.address },
        { kind: 'click', target: { role: 'button', name: 'Crear cuenta' } },
        { kind: 'wait', url: /\/$/ },
      ],
    },
    {
      actions: [
        { kind: 'click', target: { role: 'link', name: PRODUCT } },
        { kind: 'wait', url: /\/products\/[^/]+$/ },
      ],
    },
    {
      actions: [
        { kind: 'click', target: { role: 'button', name: 'Añadir al carrito' } },
        { kind: 'wait', url: /\/cart$/ },
      ],
    },
    {
      actions: [
        { kind: 'click', target: { role: 'link', name: 'Ir a pagar' } },
        { kind: 'wait', url: /\/checkout$/ },
      ],
    },
    {
      actions: [
        { kind: 'click', target: { role: 'button', name: 'Confirmar pedido' } },
        { kind: 'wait', url: /\/orders\/\d+(\?.*)?$/ },
      ],
    },
    { actions: [{ kind: 'snapshot' }] },
  ];
}

function selectorOf(action: Action): string | undefined {
  switch (action.kind) {
    case 'type':
    case 'click':
      return describeTarget(action.target);
    case 'wait':
      return `url=${action.url.source}`;
    default:
      return undefined;
  }
}

/**
 * A fixed, LLM-free shopper for ShopLab: signs up, buys one product and lands on the order
 * page. Every action becomes an agent.action event and every step an agent.step event, with
 * timings, so the event log, replay and friction engine can be built before any LLM agent.
 */
export class ScriptedPurchaseAgent {
  constructor(
    private readonly browser: BrowserPort,
    private readonly recorder: RunEventRecorder,
    private readonly now: () => number = () => performance.now(),
  ) {}

  async run(input: ScriptedPurchaseInput): Promise<{ orderUrl: string; steps: number }> {
    const baseUrl = input.baseUrl.replace(/\/$/, '');
    const session = await this.browser.newSession({ baseUrl });
    const steps = purchaseSteps(input.buyer);
    try {
      let url = baseUrl;
      for (const [stepIndex, step] of steps.entries()) {
        const stepStarted = this.now();
        for (const action of step.actions) {
          await this.perform(session, baseUrl, stepIndex, action);
        }
        url = (await this.browser.snapshot(session)).url;
        await this.recorder.record('agent.step', {
          stepIndex,
          url,
          durationMs: this.now() - stepStarted,
        });
      }
      return { orderUrl: url, steps: steps.length };
    } finally {
      await this.browser.close(session);
    }
  }

  private async perform(
    session: string,
    baseUrl: string,
    stepIndex: number,
    action: Action,
  ): Promise<void> {
    const started = this.now();
    const selector = selectorOf(action);
    const record = (ok: boolean) =>
      this.recorder.record('agent.action', {
        stepIndex,
        action: action.kind,
        ...(selector === undefined ? {} : { selector }),
        durationMs: this.now() - started,
        ok,
      });
    try {
      switch (action.kind) {
        case 'goto':
          await this.browser.goto(session, `${baseUrl}${action.path}`);
          break;
        case 'type':
          await this.browser.type(session, action.target, action.text);
          break;
        case 'click':
          await this.browser.click(session, action.target);
          break;
        case 'wait':
          await this.browser.waitForUrl(session, action.url);
          break;
        case 'snapshot':
          await this.browser.snapshot(session);
          break;
      }
    } catch (error) {
      await record(false);
      throw error;
    }
    await record(true);
  }
}
