import {
  newUlid,
  type BlockReason,
  type OracleName,
  type PocSteps,
  type ProofOfConcept,
  type RedTeamClass,
} from '@janus/shared-kernel';

import type { AttackRequest } from '../../domain/attack/attack-request.js';
import type { AttackTarget } from '../../domain/attack/attack-target.js';
import type { AttemptLimits } from '../../domain/attack/attempt-limits.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import { authenticatedAs } from '../../domain/oracles/authenticated-as.js';
import { canaryLeak } from '../../domain/oracles/canary-leak.js';
import type { OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import { ScopeBlockedError } from '../../domain/scope/network-guard.js';
import type { ScopedHttpClient, ScopedReply } from '../../domain/scope/scoped-http-port.js';
import { asSession } from '../attack/session-client.js';
import type { RunEventRecorder } from '../run-event-recorder.js';

export type { OracleName } from '@janus/shared-kernel';

const JWT = /eyJ[\w-]{4,}\.eyJ[\w-]{4,}\.[\w-]*/;

const SEVERITY: Readonly<Record<RedTeamClass, 'high' | 'critical'>> = {
  idor: 'high',
  'auth-bypass': 'critical',
  xss: 'high',
  'business-logic': 'high',
};
const TITLE: Readonly<Record<RedTeamClass, string>> = {
  idor: 'Another user’s data is reachable (IDOR)',
  'auth-bypass': 'A session opens without the right credentials',
  xss: 'Injected script runs in the page (XSS)',
  'business-logic': 'The shop accepts a request it should refuse',
};

/** One recorded attempt: an HTTP request, a browser visit or the step that carried a flow. */
export interface SentAttempt {
  readonly number: number;
  readonly id: string;
  readonly class: RedTeamClass;
  readonly as: 'b' | 'anonymous';
  readonly endpoint: string;
  /** The HTTP request and its reply, for the classes judged on one request. */
  readonly request: AttackRequest | null;
  readonly reply: ScopedReply | null;
  readonly blocked: BlockReason | null;
  readonly failure: string | null;
}

export type SendResult =
  | { readonly admitted: false; readonly reason: string; readonly limit?: 'endpoint' | 'run' }
  | { readonly admitted: true; readonly attempt: SentAttempt };

/** What a browser visit or a flow step looked like, to be recorded as an attempt. */
export interface ObservedStep {
  readonly class: RedTeamClass;
  readonly as: 'b' | 'anonymous';
  readonly method: string;
  /** Path on the target (no query string is recorded). */
  readonly path: string;
  readonly status: number | null;
  readonly bytes?: number;
  readonly blocked?: BlockReason;
}

export interface RedTeamFinding {
  readonly findingId: string;
  readonly testType: RedTeamClass;
  readonly endpoint: string;
  readonly attempt: number;
  readonly evidence: string;
  /** How to reproduce it in any run (F3.4). */
  readonly poc: ProofOfConcept;
}

export interface AttackBenchDeps {
  readonly runId: string;
  readonly origin: string;
  readonly classes: readonly RedTeamClass[];
  readonly client: ScopedHttpClient;
  readonly target: AttackTarget;
  readonly limits: AttemptLimits;
  readonly orchestrator: RunEventRecorder;
  readonly agent: RunEventRecorder;
  /** The target's name, written into each PoC. */
  readonly targetName: string;
  /** False when replaying PoCs: verdicts are recorded, findings are not (F3.4). */
  readonly recordFindings?: boolean;
}

const PARAM = /:[A-Za-z][\w-]*/;

/** The submitted login read from an attempt's JSON body; empty strings when there is none. */
function submittedLogin(body: string | undefined): { email: string; password: string } {
  try {
    const parsed: unknown = JSON.parse(body ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) {
      const email = 'email' in parsed && typeof parsed.email === 'string' ? parsed.email : '';
      const password =
        'password' in parsed && typeof parsed.password === 'string' ? parsed.password : '';
      return { email, password };
    }
  } catch {
    // Not JSON: nothing was submitted as a login.
  }
  return { email: '', password: '' };
}

/**
 * The primitives every Red Team attack shares (F3.3, ADR 0011). `send` makes one guarded HTTP
 * request; `record` logs any other attempt (a browser visit, the step that carried a flow); both
 * count against the limits and record `attack.attempt`. `judge` runs the oracle of a one-request
 * class; `conclude` records an oracle's verdict and, only when exploitable and new for that
 * endpoint, a `suspected` dynamic finding. The engine and the disabled LLM agent both drive this
 * bench, so they record the same events. Never records bodies, tokens or passwords.
 */
export class AttackBench {
  private readonly known: ReadonlyMap<string, string>;
  private readonly attemptList: SentAttempt[] = [];
  private readonly findingList: RedTeamFinding[] = [];

  private constructor(
    private readonly deps: AttackBenchDeps,
    readonly victim: TestSession,
    readonly attacker: TestSession,
    private readonly canaries: readonly string[],
  ) {
    this.known = new Map([
      [victim.user.email, victim.user.password],
      [attacker.user.email, attacker.user.password],
    ]);
  }

  /** Registers victim A (with data worth stealing) and attacker B, then builds the bench. */
  static async open(deps: AttackBenchDeps): Promise<AttackBench> {
    const victim = await deps.target.users.login(await deps.target.users.register('a'));
    const attacker = await deps.target.users.login(await deps.target.users.register('b'));
    const canaries = await deps.target.victim.seed(victim);
    return new AttackBench(deps, victim, attacker, canaries);
  }

  get origin(): string {
    return this.deps.origin;
  }

  get target(): AttackTarget {
    return this.deps.target;
  }

  /** The run's guarded client, sending as the attacker. */
  get asAttacker(): ScopedHttpClient {
    return asSession(this.deps.client, this.attacker);
  }

  get attempts(): readonly SentAttempt[] {
    return this.attemptList;
  }

  /** How many attempts the run has left. */
  get budgetLeft(): number {
    return this.deps.limits.remaining();
  }

  get findings(): readonly RedTeamFinding[] {
    return this.findingList;
  }

  /** Sends one HTTP request through the guard, counting and recording it. */
  async send(request: AttackRequest): Promise<SendResult> {
    if (!this.deps.classes.includes(request.class)) {
      return { admitted: false, reason: `${request.class} is not a class of this run` };
    }
    let url: URL;
    try {
      url = new URL(request.path, this.deps.origin);
    } catch {
      return { admitted: false, reason: 'the path is not valid' };
    }
    if (url.origin !== this.deps.origin) {
      return { admitted: false, reason: 'the path must be on the shop, not another host' };
    }
    const admission = this.deps.limits.admit(request.method, url.pathname);
    if (!admission.admitted) {
      return { admitted: false, reason: admission.reason, limit: admission.scope };
    }

    const sender = request.as === 'b' ? this.asAttacker : this.deps.client;
    let reply: ScopedReply | null = null;
    let failure: string | null = null;
    let blocked: BlockReason | null = null;
    try {
      reply = await sender.send({
        method: request.method,
        url: url.href,
        testType: request.class,
        ...(request.body === undefined
          ? {}
          : { body: request.body, headers: { 'content-type': 'application/json' } }),
      });
    } catch (error) {
      if (error instanceof ScopeBlockedError) blocked = error.blocked.reason;
      else failure = error instanceof Error ? error.message : String(error);
    }
    const attempt = await this.log(
      {
        class: request.class,
        as: request.as,
        method: request.method,
        path: url.pathname,
        status: reply?.status ?? null,
        bytes: reply?.body.length ?? 0,
        ...(blocked === null ? {} : { blocked }),
      },
      admission.endpoint,
      { request, reply, failure },
    );
    return { admitted: true, attempt };
  }

  /** Counts and records an attempt the bench did not send itself (a visit, a flow step). */
  async record(step: ObservedStep): Promise<SendResult> {
    if (!this.deps.classes.includes(step.class)) {
      return { admitted: false, reason: `${step.class} is not a class of this run` };
    }
    const admission = this.deps.limits.admit(step.method, step.path);
    if (!admission.admitted) {
      return { admitted: false, reason: admission.reason, limit: admission.scope };
    }
    const attempt = await this.log(step, admission.endpoint, {
      request: null,
      reply: null,
      failure: null,
    });
    return { admitted: true, attempt };
  }

  /**
   * Runs the oracle of a class judged on one HTTP request (IDOR, login bypass) and concludes.
   * Null when the attempt got no response or belongs to another class.
   */
  async judge(attempt: SentAttempt): Promise<OracleVerdict | null> {
    if (attempt.reply === null || attempt.request === null) return null;
    const { reply, request } = attempt;
    if (attempt.class === 'idor') {
      const verdict = canaryLeak({
        owner: { userId: this.victim.user.userId, canaries: this.canaries },
        viewer: { userId: attempt.as === 'b' ? this.attacker.user.userId : -1 },
        response: reply,
      });
      await this.conclude(attempt, 'canary-leak', verdict, this.idorSteps(attempt, request.path));
      return verdict;
    }
    if (attempt.class === 'auth-bypass') {
      const token = JWT.exec(reply.body)?.[0];
      const verdict = authenticatedAs({
        sessionEmail: token === undefined ? null : await this.deps.target.users.whoami(token),
        submitted: submittedLogin(request.body),
        known: this.known,
      });
      await this.conclude(attempt, 'authenticated-as', verdict, {
        kind: 'auth-bypass',
        method: 'POST',
        path: request.path,
        body: request.body ?? '',
      });
      return verdict;
    }
    return null;
  }

  /**
   * Records an oracle's verdict on an attempt and, when exploitable and new for that endpoint, a
   * finding with the PoC that reproduces it.
   */
  async conclude(
    attempt: SentAttempt,
    oracle: OracleName,
    verdict: OracleVerdict,
    steps: PocSteps,
  ): Promise<void> {
    await this.deps.orchestrator.record('attack.verdict', {
      attemptId: attempt.id,
      testType: attempt.class,
      oracle,
      exploitable: verdict.exploitable,
      evidence: verdict.evidence,
    });
    const already = this.findingList.some(
      (each) => each.testType === attempt.class && each.endpoint === attempt.endpoint,
    );
    if (!verdict.exploitable || already || this.deps.recordFindings === false) return;
    const findingId = newUlid();
    await this.deps.orchestrator.record('finding.created', {
      findingId,
      kind: 'dynamic',
      severity: SEVERITY[attempt.class],
      title: `${TITLE[attempt.class]}: ${attempt.endpoint} (${verdict.evidence})`.slice(0, 300),
      status: 'suspected',
      tool: 'red-team',
      rule: attempt.class,
    });
    this.findingList.push({
      findingId,
      testType: attempt.class,
      endpoint: attempt.endpoint,
      attempt: attempt.number,
      evidence: verdict.evidence,
      poc: {
        version: 1,
        target: this.deps.targetName,
        class: attempt.class,
        oracle,
        endpoint: attempt.endpoint,
        steps,
      },
    });
  }

  /**
   * An IDOR as replayable steps: the route, and which object of the victim filled its id. A run's
   * own ids never go into a PoC; another run binds them to its own users.
   */
  private idorSteps(attempt: SentAttempt, path: string): PocSteps {
    const route = attempt.endpoint.replace(/^GET /, '');
    const index = route.split('/').findIndex((part) => PARAM.test(part));
    const id = Number(path.split('?')[0]?.split('/')[index]);
    const bind =
      id === this.victim.basketId
        ? { victim: 'basketId' as const }
        : id === this.victim.user.userId
          ? { victim: 'userId' as const }
          : { offsetFromAttackerBasket: id - (this.attacker.basketId ?? 0) };
    return { kind: 'idor', method: 'GET', route, bind };
  }

  private async log(
    step: ObservedStep,
    endpoint: string,
    extra: Pick<SentAttempt, 'request' | 'reply' | 'failure'>,
  ): Promise<SentAttempt> {
    const attempt: SentAttempt = {
      id: newUlid(),
      number: this.attemptList.length + 1,
      class: step.class,
      as: step.as,
      endpoint,
      blocked: step.blocked ?? null,
      ...extra,
    };
    this.attemptList.push(attempt);
    await this.deps.agent.record('attack.attempt', {
      attemptId: attempt.id,
      number: attempt.number,
      testType: step.class,
      as: step.as,
      method: step.method,
      path: step.path.split('?')[0]?.slice(0, 300) ?? '',
      status: step.status,
      bytes: step.bytes ?? 0,
      ...(step.blocked === undefined ? {} : { blocked: step.blocked }),
    });
    return attempt;
  }
}
