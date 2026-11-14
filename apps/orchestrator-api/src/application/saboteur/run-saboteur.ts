import { newUlid, type BlockReason } from '@janus/shared-kernel';

import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import { unthrottledGuessing } from '../../domain/oracles/unthrottled-guessing.js';
import { unthrottledRequests } from '../../domain/oracles/unthrottled-requests.js';
import type { SessionJob, SessionResult } from '../../domain/run/session-queue-port.js';
import {
  SATURATION_REQUESTS,
  WRONG_GUESSES,
  saboteurTarget,
  taskOf,
  waitMs,
  type SaboteurTarget,
  type SaboteurTask,
} from '../../domain/saboteur/saboteur-plan.js';
import { NetworkGuard, ScopeBlockedError } from '../../domain/scope/network-guard.js';
import type { ScopedHttpPort, ScopedReply } from '../../domain/scope/scoped-http-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { recordBlocked } from '../scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import type { SaboteurScopes } from './saboteur-scopes.js';

export interface RunSaboteurDeps {
  readonly store: EventStorePort;
  readonly http: ScopedHttpPort;
  readonly scopes: SaboteurScopes;
  /** Waits between requests; tests pass one that does not wait. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What one request got back; `reply` is null when nothing came back. */
interface Sent {
  readonly reply: ScopedReply | null;
  readonly ms: number;
}

type Send = (
  testType: SaboteurTask,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<Sent>;

/** The guard refused a request: the saboteur stops there (`scope.blocked` is recorded). */
class GuardStop extends Error {
  constructor(readonly reason: BlockReason) {
    super(reason);
  }
}

/**
 * One saboteur of a Launch Day run (F4.1, ADR 0020): a session that is not a shopper. It loads the
 * shop at a steady rate (`saturation`) or guesses at an account's password (`brute-force`), as the
 * simulated visitor whose address its slot names, and a pure oracle says whether the shop ever
 * pushed back. Same rules as the Red Team: a verified scope, every request through the guard, one
 * `attack.attempt` per request and one `attack.verdict`. It records no finding: ShopLab has no
 * flaw to find, and what is measured is what a defense does to abuse.
 */
export class RunSaboteur {
  constructor(private readonly deps: RunSaboteurDeps) {}

  async execute(job: SessionJob, signal: AbortSignal): Promise<SessionResult> {
    const { spec, runId, variant } = job;
    const { sessionIndex } = spec;
    const plan = saboteurTarget(job.target);
    const task = taskOf(spec.seed);
    const rate = spec.requestsPerSecond ?? 1;
    const client = spec.clientIp ?? '10.99.0.1';
    const now = this.deps.now ?? Date.now;
    const sleep = this.deps.sleep ?? wait;
    const who = `saboteur-${spec.variant}-s${String(spec.seed)}`;

    const scope = await this.deps.scopes.forVariant({
      runId,
      target: job.target,
      variantId: variant.variantId,
      baseUrl: variant.baseUrl,
    });
    const orchestrator = new RunEventRecorder(this.deps.store, runId, ORCHESTRATOR_ACTOR);
    const agent = new RunEventRecorder(this.deps.store, runId, {
      agentId: `${who}-a${String(job.attempt)}`,
      role: 'red-team',
    });
    const http = this.deps.http.client(new NetworkGuard(scope), recordBlocked(orchestrator));
    const origin = new URL(variant.baseUrl).origin;

    await agent.record('session.started', {
      variant: spec.variant,
      kind: 'saboteur',
      seed: spec.seed,
      attempt: job.attempt,
      role: 'saboteur',
      client,
    });
    const startedAt = now();
    let number = 0;
    let lastAttempt = newUlid();

    const send: Send = async (testType, method, path, body) => {
      const began = now();
      let reply: ScopedReply | null = null;
      let blocked: BlockReason | undefined;
      try {
        reply = await http.send({
          method,
          url: `${origin}${path}`,
          testType,
          headers: {
            'x-forwarded-for': client,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        // A request that got no answer is recorded as such; the oracles prove nothing from it.
        if (error instanceof ScopeBlockedError) blocked = error.blocked.reason;
      }
      number += 1;
      lastAttempt = newUlid();
      await agent.record('attack.attempt', {
        attemptId: lastAttempt,
        number,
        testType,
        as: 'anonymous',
        method,
        path,
        endpoint: `${method} ${path}`,
        status: reply?.status ?? null,
        bytes: reply?.body.length ?? 0,
        ...(blocked === undefined ? {} : { blocked }),
      });
      if (blocked !== undefined) throw new GuardStop(blocked);
      return { reply, ms: now() - began };
    };

    /** Keeps the pace between requests; false once the run has stopped. */
    const pace = async (took: number): Promise<boolean> => {
      if (signal.aborted) return false;
      await sleep(waitMs(rate, took));
      return !signal.aborted;
    };

    try {
      const verdict =
        task === 'saturation'
          ? await this.saturate(plan, send, pace, rate)
          : await this.guess(plan, send, pace, who);
      if (signal.aborted) return { sessionIndex, status: 'cancelled' };
      await orchestrator.record('attack.verdict', {
        attemptId: lastAttempt,
        testType: task,
        oracle: task === 'saturation' ? 'unthrottled-requests' : 'unthrottled-guessing',
        exploitable: verdict.exploitable,
        evidence: verdict.evidence,
      });
      await agent.record('session.ended', {
        outcome: 'success',
        reason: verdict.evidence,
        steps: number,
        durationMs: now() - startedAt,
      });
      return { sessionIndex, status: 'completed' };
    } catch (error) {
      if (error instanceof GuardStop) {
        return { sessionIndex, status: 'failed', detail: `the guard refused: ${error.reason}` };
      }
      throw error;
    }
  }

  private async saturate(
    plan: SaboteurTarget,
    send: Send,
    pace: (took: number) => Promise<boolean>,
    rate: number,
  ): Promise<OracleVerdict> {
    const replies: { status: number | null }[] = [];
    for (let i = 0; i < SATURATION_REQUESTS; i++) {
      const { reply, ms } = await send('saturation', plan.saturate.method, plan.saturate.path);
      replies.push({ status: reply?.status ?? null });
      if (!(await pace(ms))) break;
    }
    return unthrottledRequests({ replies, requestsPerSecond: rate });
  }

  /**
   * Makes an account of its own, tries wrong passwords at it and then the right one. All
   * synthetic and made for this: it never touches a shopper's account.
   */
  private async guess(
    plan: SaboteurTarget,
    send: Send,
    pace: (took: number) => Promise<boolean>,
    who: string,
  ): Promise<OracleVerdict> {
    const email = `${who}-${newUlid().slice(-8).toLowerCase()}@shoplab.test`;
    const password = `pw-${newUlid().slice(-10).toLowerCase()}`;
    const made = await send('brute-force', 'POST', plan.register.path, {
      name: 'Saboteador Sintético',
      email,
      password,
      address: plan.register.address,
    });
    if (made.reply?.status !== 201) {
      return unthrottledGuessing({ guesses: [], rightAfter: { signedIn: false } });
    }
    const guesses: { status: number | null; ms: number }[] = [];
    for (let i = 0; i < WRONG_GUESSES; i++) {
      if (!(await pace(0))) break;
      const { reply, ms } = await send('brute-force', 'POST', plan.login.path, {
        email,
        password: `wrong-${String(i)}-${password}`,
      });
      guesses.push({ status: reply?.status ?? null, ms });
    }
    await pace(0);
    const right = await send('brute-force', 'POST', plan.login.path, { email, password });
    return unthrottledGuessing({ guesses, rightAfter: { signedIn: right.reply?.status === 200 } });
  }
}
