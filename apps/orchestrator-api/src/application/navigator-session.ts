import { ObservationBuilder, type ElementLocator } from '@janus/observation-builder';
import { agentActionSchema, fromToolCall, type SessionEndedEvent } from '@janus/shared-kernel';

import type { BrowserPort } from '../domain/browser/browser-port.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { BudgetExhaustedError } from '../domain/llm/budget-exhausted-error.js';
import type { Budget } from '../domain/llm/budget.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { Persona } from '../domain/persona/persona.js';
import { ActionExecutor, type ActionResult } from './action-executor.js';
import { NavigatorPrompt, type NavigatorTask } from './navigator-prompt.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { formatEntry, WorkingMemory } from './working-memory.js';

export interface NavigatorSessionDeps {
  readonly browser: BrowserPort;
  readonly gateway: LLMGatewayPort;
  readonly store: EventStorePort;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface NavigatorSessionInput {
  readonly runId: string;
  readonly agentId: string;
  readonly baseUrl: string;
  /** Where the persona lands first. Defaults to the home page. */
  readonly startPath?: string;
  readonly persona: Persona;
  readonly task: NavigatorTask;
  /** The run's shared budget; every LLM call is charged to it. */
  readonly budget: Budget;
  readonly signal?: AbortSignal;
}

type Outcome = SessionEndedEvent['payload']['outcome'];

export interface NavigatorSessionResult {
  readonly outcome: Outcome;
  readonly reason?: string;
  readonly steps: number;
}

const SUMMARY_RULES = `You keep the notes of a shopper in a usability study. Given the notes so far and the latest actions, write the updated notes: at most two short sentences, in the first person, about what was done, what worked and what did not. Do not give advice and do not mention refs.`;
const SUMMARY_MAX_CHARS = 400;

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
 * One persona navigating the target with an LLM (F1.4): observe → decide (one tool call) →
 * act → record, until the persona is done, its patience runs out or the run budget does.
 * Infrastructure failures are thrown to the caller, which decides about retries.
 */
export class NavigatorSession {
  private readonly now: () => number;

  constructor(private readonly deps: NavigatorSessionDeps) {
    this.now = deps.now ?? (() => performance.now());
  }

  async run(input: NavigatorSessionInput): Promise<NavigatorSessionResult> {
    const { browser, gateway, store } = this.deps;
    const { persona, budget } = input;
    const baseUrl = input.baseUrl.replace(/\/$/, '');
    const recorder = new RunEventRecorder(store, input.runId, {
      agentId: input.agentId,
      role: persona.modelRole,
    });
    const executor = new ActionExecutor(browser, recorder, {
      now: this.now,
      ...(this.deps.sleep === undefined ? {} : { sleep: this.deps.sleep }),
    });
    const prompt = NavigatorPrompt.forSession(persona, input.task);
    const builder = new ObservationBuilder();
    const memory = new WorkingMemory();
    const context = { runId: input.runId, agentId: input.agentId };
    const started = this.now();

    const end = async (outcome: Outcome, steps: number, reason?: string) => {
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

        if (memory.summaryDue()) {
          memory.setSummary(await this.summarize(memory, persona, budget, context));
        }

        const response = await gateway.complete({
          ...prompt.request({
            stepIndex: steps,
            observation: observation.full,
            lastResult,
            memory: memory.render(),
          }),
          budget,
          context,
        });
        const call = response.content.find((block) => block.type === 'tool_use');
        const { action, thought } =
          call === undefined
            ? { action: { type: 'no-tool-call' } }
            : fromToolCall(call.name, call.input);
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
        });
        steps += 1;
        if (result.status === 'done') return await end(result.outcome, steps, result.reason);
        lastResult = result;
      }
    } catch (error) {
      if (error instanceof BudgetExhaustedError) return await end('budget_exhausted', steps);
      throw error;
    } finally {
      await browser.close(session);
    }
  }

  private async summarize(
    memory: WorkingMemory,
    persona: Persona,
    budget: Budget,
    context: { runId: string; agentId: string },
  ): Promise<string> {
    const { previous, entries } = memory.toSummarize();
    const response = await this.deps.gateway.complete({
      role: persona.modelRole,
      system: { stable: SUMMARY_RULES },
      messages: [
        {
          role: 'user',
          content: [
            `Goal: ${persona.goal}`,
            `Notes so far: ${previous ?? '(none)'}`,
            'Latest actions:',
            ...entries.map(formatEntry),
          ].join('\n'),
        },
      ],
      maxTokens: 300,
      budget,
      context,
    });
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text === '' ? (previous ?? '') : text.slice(0, SUMMARY_MAX_CHARS);
  }
}
