import {
  InvalidAgentActionError,
  parseAgentAction,
  type AgentAction,
  type AgentActionEvent,
} from '@janus/shared-kernel';

import {
  ElementDisabledError,
  ElementNotFoundError,
  ElementObscuredError,
  NavigationTimeoutError,
  OptionNotFoundError,
} from '../domain/browser/browser-errors.js';
import {
  describeTarget,
  type BrowserPort,
  type ElementTarget,
} from '../domain/browser/browser-port.js';
import type { RefMap } from '../domain/browser/ref-map.js';
import type { RunEventRecorder } from './run-event-recorder.js';

export type ActionResult =
  | { readonly status: 'ok' }
  | { readonly status: 'done'; readonly outcome: 'success' | 'abandon'; readonly reason: string }
  /** What went wrong, for the agent's next observation. The session goes on. */
  | {
      readonly status: 'failed';
      readonly error: { readonly code: string; readonly message: string };
    };

export interface ActionExecutorOptions {
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Browser errors an agent can cause and learn from; anything else is infrastructure. */
const AGENT_FACING = [
  ElementNotFoundError,
  ElementObscuredError,
  ElementDisabledError,
  OptionNotFoundError,
  NavigationTimeoutError,
];

/** The agent.action payload, filled in while the action runs. */
type ActionPayload = {
  -readonly [K in keyof AgentActionEvent['payload']]: AgentActionEvent['payload'][K];
};

class ActionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function typeOf(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null && 'type' in raw) {
    const { type } = raw;
    if (typeof type === 'string' && type !== '') return type.slice(0, 40);
  }
  return 'invalid';
}

/**
 * Runs one navigator action (F1.2): validates it, turns its ref into a target from the latest
 * observation, acts, and records an agent.action event. Mistakes the agent can learn from come
 * back as a `failed` result for the next observation; infrastructure failures still throw.
 */
export class ActionExecutor {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly browser: BrowserPort,
    private readonly recorder: RunEventRecorder,
    options: ActionExecutorOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async execute(
    session: string,
    raw: unknown,
    refs: RefMap,
    stepIndex: number,
  ): Promise<ActionResult> {
    const started = this.now();
    const event: ActionPayload = {
      stepIndex,
      action: typeOf(raw),
      durationMs: 0,
      ok: false,
    };
    try {
      const action = parseAgentAction(raw);
      const result = await this.perform(session, action, refs, event);
      event.ok = true;
      return result;
    } catch (error) {
      const failure = this.failureOf(error);
      if (failure === undefined) throw error;
      event.errorCode = failure.code;
      return { status: 'failed', error: failure };
    } finally {
      event.durationMs = this.now() - started;
      await this.recorder.record('agent.action', event);
    }
  }

  private async perform(
    session: string,
    action: AgentAction,
    refs: RefMap,
    event: ActionPayload,
  ): Promise<ActionResult> {
    const resolve = (ref: string): ElementTarget => {
      event.ref = ref;
      const target = refs.get(ref);
      if (target === undefined) {
        throw new ActionFailure('action.unknown-ref', `No element ${ref} in the current page.`);
      }
      event.selector = describeTarget(target);
      return target;
    };
    const located = async (ref: string): Promise<ElementTarget> => {
      const target = resolve(ref);
      event.boundingBox = await this.browser.locate(session, target);
      return target;
    };

    switch (action.type) {
      case 'click':
        await this.browser.click(session, await located(action.ref));
        break;
      case 'type':
        await this.browser.type(session, await located(action.ref), action.text);
        break;
      case 'select':
        await this.browser.select(session, await located(action.ref), action.value);
        break;
      case 'scroll':
        await this.browser.scroll(session, action.direction);
        break;
      case 'back':
        await this.browser.back(session);
        break;
      case 'wait':
        await this.sleep(action.ms);
        break;
      case 'done':
        return { status: 'done', outcome: action.outcome, reason: action.reason };
    }
    return { status: 'ok' };
  }

  private failureOf(error: unknown): { code: string; message: string } | undefined {
    if (error instanceof InvalidAgentActionError) {
      return { code: 'action.invalid', message: error.message };
    }
    if (error instanceof ActionFailure) return { code: error.code, message: error.message };
    for (const type of AGENT_FACING) {
      if (error instanceof type) return { code: error.code, message: error.message };
    }
    return undefined;
  }
}
