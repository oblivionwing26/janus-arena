import { detectFriction } from '@janus/friction-engine';
import { ObservationBuilder, type ElementLocator } from '@janus/observation-builder';
import { agentActionSchema, type SessionEndedEvent } from '@janus/shared-kernel';

import type { ArtifactStorePort } from '../domain/artifacts/artifact-store-port.js';
import type { BrowserPort } from '../domain/browser/browser-port.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { BudgetExhaustedError } from '../domain/llm/budget-exhausted-error.js';
import type { Budget } from '../domain/llm/budget.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { Persona } from '../domain/persona/persona.js';
import { checkOrder } from '../domain/task/check-order.js';
import type { OrderReaderPort } from '../domain/task/order-reader-port.js';
import type { TaskSpec } from '../domain/task/task-spec.js';
import { ActionExecutor, type ActionResult } from './action-executor.js';
import type { Decider } from './decider.js';
import { LlmDecider } from './llm-decider.js';
import type { NavigatorTask } from './navigator-prompt.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { WorkingMemory } from './working-memory.js';

export interface NavigatorSessionDeps {
  readonly browser: BrowserPort;
  readonly store: EventStorePort;
  /** Needed when the session is decided by the LLM (no `decider` in the input). */
  readonly gateway?: LLMGatewayPort;
  /** Where screenshots go when a friction signal fires (F1.6). Without it, none are taken. */
  readonly artifacts?: ArtifactStorePort;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface NavigatorSessionInput {
  readonly runId: string;
  readonly agentId: string;
  readonly baseUrl: string;
  /** Where the persona lands first. Defaults to the home page. */
  readonly startPath?: string;
  /** Its patience and device apply to every session; the rest only to the LLM. */
  readonly persona: Persona;
  /** Who decides. Defaults to the navigator LLM playing `persona` with `task` and `budget`. */
  readonly decider?: Decider;
  readonly task?: NavigatorTask;
  /** The run's shared budget; every LLM call is charged to it. */
  readonly budget?: Budget;
  readonly signal?: AbortSignal;
  /**
   * The task the session plays and how to read the target afterwards (F1.9): when the session
   * ends, the oracle checks the target and records task.verified.
   */
  readonly verify?: { readonly task: TaskSpec; readonly orders: OrderReaderPort };
}

type Outcome = SessionEndedEvent['payload']['outcome'];

export interface NavigatorSessionResult {
  readonly outcome: Outcome;
  readonly reason?: string;
  readonly steps: number;
}

function describeAction(action: unknown, locators: ReadonlyMap<string, ElementLocator>): string {
  const parsed = agentActionSchema.safeParse(action);
  if (!parsed.success) return 'an invalid answer';
  const element = (ref: string) => {
    const locator = locators.get(ref);
    return locator === undefined
      ? ref
      : `${ref} (${locator.role}${locator.name === '' ? '' : ` "${locator.name}"`})`;
  };
  const value = parsed.data;
  switch (value.type) {
    case 'click':
      return `click ${element(value.ref)}`;
    case 'type':
      // Never the text itself: it may be a password.
      return `type into ${element(value.ref)}`;
    case 'select':
      return `choose "${value.value}" in ${element(value.ref)}`;
    case 'scroll':
      return `scroll ${value.direction}`;
    case 'back':
      return 'go back';
    case 'wait':
      return `wait ${String(value.ms)} ms`;
    case 'done':
      return `finish (${value.outcome})`;
  }
}

function resultOf(result: ActionResult): string {
  return result.status === 'failed' ? `failed (${result.error.code})` : 'ok';
}

/**
 * One agent session over the target (F1.4, instrumented in F1.6): observe → decide → act →
 * record, until the decider is done, the persona's patience runs out or the run budget does.
 * Each step also records the page's alerts, technical errors and web vitals, and saves a
 * screenshot when a new friction signal appears. Infrastructure failures are thrown.
 */
export class NavigatorSession {
  private readonly now: () => number;

  constructor(private readonly deps: NavigatorSessionDeps) {
    this.now = deps.now ?? (() => performance.now());
  }

  async run(input: NavigatorSessionInput): Promise<NavigatorSessionResult> {
    const { browser, store } = this.deps;
    const { persona } = input;
    const decider = input.decider ?? this.llmDecider(input);
    const baseUrl = input.baseUrl.replace(/\/$/, '');
    const recorder = new RunEventRecorder(store, input.runId, {
      agentId: input.agentId,
      role: decider.role,
    });
    const executor = new ActionExecutor(browser, recorder, {
      now: this.now,
      ...(this.deps.sleep === undefined ? {} : { sleep: this.deps.sleep }),
    });
    const builder = new ObservationBuilder();
    const memory = new WorkingMemory();
    const seenSignals = new Set<string>();
    const started = this.now();

    let ended: Outcome | undefined;
    const end = async (outcome: Outcome, steps: number, reason?: string) => {
      ended = outcome;
      const result = { outcome, steps, ...(reason === undefined ? {} : { reason }) };
      await recorder.record('session.ended', {
        ...result,
        durationMs: Math.max(0, this.now() - started),
      });
      return result;
    };

    const session = await browser.newSession({ baseUrl, device: persona.device });
    let steps = 0;
    try {
      await browser.goto(session, `${baseUrl}${input.startPath ?? '/'}`);
      let lastResult: ActionResult | null = null;
      for (;;) {
        input.signal?.throwIfAborted();
        if (persona.patience.isExhausted({ steps, elapsedMs: this.now() - started })) {
          return await end('patience_exhausted', steps);
        }
        const stepStarted = this.now();
        await browser.settle(session);
        const snapshot = await browser.snapshot(session);
        const observation = builder.observe(snapshot);

        const { action, thought } = await decider.decide({
          stepIndex: steps,
          observation,
          lastResult,
          memory,
        });
        if (thought !== undefined) {
          await recorder.record('agent.thought', { stepIndex: steps, text: thought });
        }

        const result = await executor.execute(session, action, observation.locators, steps);
        memory.add({
          stepIndex: steps,
          action: describeAction(action, observation.locators),
          result: resultOf(result),
        });
        await recorder.record('agent.step', {
          stepIndex: steps,
          url: snapshot.url,
          durationMs: Math.max(0, this.now() - stepStarted),
          ...(observation.alerts.length === 0 ? {} : { alerts: [...observation.alerts] }),
          ...(observation.texts.length === 0 ? {} : { texts: [...observation.texts] }),
        });
        await this.recordTelemetry(session, recorder, steps);
        await this.screenshotNewSignals(session, input, recorder, steps, snapshot.url, seenSignals);
        steps += 1;
        if (result.status === 'done') return await end(result.outcome, steps, result.reason);
        lastResult = result;
      }
    } catch (error) {
      if (error instanceof BudgetExhaustedError) return await end('budget_exhausted', steps);
      throw error;
    } finally {
      // Budget exhaustion is our limit, not the shopper's: such sessions are not verified.
      if (input.verify !== undefined && ended !== undefined && ended !== 'budget_exhausted') {
        await this.verifyTask(session, input.verify, recorder);
      }
      await browser.close(session);
    }
  }

  /** The oracle (F1.9): what the target says happened, never what the agent claimed. */
  private async verifyTask(
    session: string,
    verify: { readonly task: TaskSpec; readonly orders: OrderReaderPort },
    recorder: RunEventRecorder,
  ): Promise<void> {
    const taskId = verify.task.id;
    let orders;
    try {
      orders = await verify.orders.read(session);
    } catch (error) {
      const detail =
        (error instanceof Error ? error.message : String(error)).slice(0, 300) || 'error';
      await recorder.record('task.verified', {
        taskId,
        status: 'unverifiable',
        checks: [{ check: 'read the orders', passed: false, detail }],
      });
      return;
    }
    const verdict = checkOrder(orders, verify.task.expect);
    await recorder.record('task.verified', {
      taskId,
      status: verdict.passed ? 'passed' : 'failed',
      checks: verdict.checks.map((check) => ({ ...check })),
      ...(verdict.orderId === undefined ? {} : { orderId: verdict.orderId }),
    });
  }

  private llmDecider(input: NavigatorSessionInput): Decider {
    const { gateway } = this.deps;
    if (gateway === undefined || input.task === undefined || input.budget === undefined) {
      throw new Error('An LLM session needs a gateway, a task and a budget');
    }
    return new LlmDecider({
      gateway,
      persona: input.persona,
      task: input.task,
      budget: input.budget,
      context: { runId: input.runId, agentId: input.agentId },
    });
  }

  /**
   * page.error for each technical error since the last step, scope.blocked for each request the
   * browser's guard refused, page.vitals when measured.
   */
  private async recordTelemetry(
    session: string,
    recorder: RunEventRecorder,
    stepIndex: number,
  ): Promise<void> {
    const telemetry = await this.deps.browser.drainTelemetry(session);
    for (const error of telemetry.errors) {
      await recorder.record('page.error', {
        stepIndex,
        kind: error.kind,
        url: error.url,
        message: error.message,
        ...(error.status === undefined ? {} : { status: error.status }),
      });
    }
    for (const blocked of telemetry.blocked ?? []) {
      await recorder.record('scope.blocked', { ...blocked });
    }
    const { vitals } = telemetry;
    if (vitals === null) return;
    await recorder.record('page.vitals', {
      stepIndex,
      url: vitals.url,
      ...(vitals.lcpMs === undefined ? {} : { lcpMs: vitals.lcpMs }),
      ...(vitals.cls === undefined ? {} : { cls: vitals.cls }),
      ...(vitals.inpMs === undefined ? {} : { inpMs: vitals.inpMs }),
    });
  }

  /**
   * Runs the friction engine over this session so far; when a signal appears for the first
   * time, saves one screenshot of the page and records page.screenshot (F1.6).
   */
  private async screenshotNewSignals(
    session: string,
    input: NavigatorSessionInput,
    recorder: RunEventRecorder,
    stepIndex: number,
    url: string,
    seen: Set<string>,
  ): Promise<void> {
    const { artifacts, store, browser } = this.deps;
    if (artifacts === undefined) return;
    const own = (await store.readRun(input.runId)).filter(
      (event) => event.actor.agentId === input.agentId,
    );
    const fresh = detectFriction(own).filter((signal) => {
      const key = `${signal.detector}:${signal.evidenceEventIds.join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const first = fresh[0];
    if (first === undefined) return;
    const artifact = `${input.agentId}/step-${String(stepIndex)}.png`;
    await artifacts.put(input.runId, artifact, await browser.screenshot(session));
    await recorder.record('page.screenshot', {
      stepIndex,
      url,
      artifact,
      detector: first.detector,
    });
  }
}
