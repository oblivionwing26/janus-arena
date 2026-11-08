import { newUlid, type BlockReason, type RedTeamClass } from '@janus/shared-kernel';

import type { AttackTarget } from '../../domain/attack/attack-target.js';
import type { AttackRequest } from '../../domain/attack/attack-request.js';
import type { AttemptLimits } from '../../domain/attack/attempt-limits.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import { authenticatedAs } from '../../domain/oracles/authenticated-as.js';
import { canaryLeak } from '../../domain/oracles/canary-leak.js';
import type { OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import { ScopeBlockedError } from '../../domain/scope/network-guard.js';
import type { ScopedHttpClient, ScopedReply } from '../../domain/scope/scoped-http-port.js';
import { asSession } from '../attack/session-client.js';
import type { RunEventRecorder } from '../run-event-recorder.js';

const JWT = /eyJ[\w-]{4,}\.eyJ[\w-]{4,}\.[\w-]*/;

const SEVERITY: Readonly<Record<RedTeamClass, 'high' | 'critical'>> = {
  idor: 'high',
  'auth-bypass': 'critical',
};
const TITLE: Readonly<Record<RedTeamClass, string>> = {
  idor: 'Another user’s data is reachable (IDOR)',
  'auth-bypass': 'A session opens without the right credentials',
};
const ORACLE = { idor: 'canary-leak', 'auth-bypass': 'authenticated-as' } as const;

/** One recorded attempt the bench sent. */
export interface SentAttempt {
  readonly number: number;
  readonly id: string;
  readonly class: RedTeamClass;
  readonly request: AttackRequest;
  readonly endpoint: string;
  readonly reply: ScopedReply | null;
  readonly blocked: BlockReason | null;
  readonly failure: string | null;
}

export type SendResult =
  | { readonly admitted: false; readonly reason: string; readonly limit?: 'endpoint' | 'run' }
  | { readonly admitted: true; readonly attempt: SentAttempt };

export interface RedTeamFinding {
  readonly findingId: string;
  readonly testType: RedTeamClass;
  readonly endpoint: string;
  readonly attempt: number;
  readonly evidence: string;
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
}

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
 * The two primitives every Red Team attack shares (F3.3, ADR 0011): send one guarded request
 * (counting it against the limits, recording `attack.attempt`), and judge an attempt with its
 * deterministic oracle (recording `attack.verdict` and, only when exploitable, a `suspected`
 * dynamic finding). The deterministic engine and the disabled LLM agent both drive this bench,
 * so they produce identical events and findings. Never records bodies, tokens or passwords.
 */
export class AttackBench {
  private readonly victim: TestSession;
  private readonly attacker: TestSession;
  private readonly canaries: readonly string[];
  private readonly known: ReadonlyMap<string, string>;
  private readonly attemptList: SentAttempt[] = [];
  private readonly findingList: RedTeamFinding[] = [];

  private constructor(
    private readonly deps: AttackBenchDeps,
    setup: {
      victim: TestSession;
      attacker: TestSession;
      canaries: readonly string[];
    },
  ) {
    this.victim = setup.victim;
    this.attacker = setup.attacker;
    this.canaries = setup.canaries;
    this.known = new Map([
      [setup.victim.user.email, setup.victim.user.password],
      [setup.attacker.user.email, setup.attacker.user.password],
    ]);
  }

  /** Registers victim A (with data worth stealing) and attacker B, then builds the bench. */
  static async open(deps: AttackBenchDeps): Promise<AttackBench> {
    const victim = await deps.target.users.login(await deps.target.users.register('a'));
    const attacker = await deps.target.users.login(await deps.target.users.register('b'));
    const canaries = await deps.target.victim.seed(victim);
    return new AttackBench(deps, { victim, attacker, canaries });
  }

  get attacker$(): TestSession {
    return this.attacker;
  }

  get attempts(): readonly SentAttempt[] {
    return this.attemptList;
  }

  get findings(): readonly RedTeamFinding[] {
    return this.findingList;
  }

  /** Sends one request through the guard, counting and recording it. */
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

    const id = newUlid();
    const number = this.attemptList.length + 1;
    const sender: ScopedHttpClient =
      request.as === 'b' ? asSession(this.deps.client, this.attacker) : this.deps.client;
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
    const attempt: SentAttempt = {
      id,
      number,
      class: request.class,
      request,
      endpoint: admission.endpoint,
      reply,
      blocked,
      failure,
    };
    this.attemptList.push(attempt);
    await this.deps.agent.record('attack.attempt', {
      attemptId: id,
      number,
      testType: request.class,
      as: request.as,
      method: request.method,
      path: url.pathname.slice(0, 300),
      status: reply?.status ?? null,
      bytes: reply?.body.length ?? 0,
      ...(blocked === null ? {} : { blocked }),
    });
    return { admitted: true, attempt };
  }

  /**
   * Runs the attempt's oracle, records the verdict and, when exploitable and not already found
   * for that endpoint, a dynamic `suspected` finding. Null when the attempt got no response.
   */
  async judge(attempt: SentAttempt): Promise<OracleVerdict | null> {
    if (attempt.reply === null) return null;
    const verdict = await this.verdictFor(attempt, attempt.reply);
    await this.deps.orchestrator.record('attack.verdict', {
      attemptId: attempt.id,
      testType: attempt.class,
      oracle: ORACLE[attempt.class],
      exploitable: verdict.exploitable,
      evidence: verdict.evidence,
    });
    const already = this.findingList.some(
      (each) => each.testType === attempt.class && each.endpoint === attempt.endpoint,
    );
    if (verdict.exploitable && !already) {
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
      });
    }
    return verdict;
  }

  private async verdictFor(attempt: SentAttempt, reply: ScopedReply): Promise<OracleVerdict> {
    if (attempt.class === 'idor') {
      return canaryLeak({
        owner: { userId: this.victim.user.userId, canaries: this.canaries },
        viewer: { userId: attempt.request.as === 'b' ? this.attacker.user.userId : -1 },
        response: reply,
      });
    }
    const token = JWT.exec(reply.body)?.[0];
    return authenticatedAs({
      sessionEmail: token === undefined ? null : await this.deps.target.users.whoami(token),
      submitted: submittedLogin(attempt.request.body),
      known: this.known,
    });
  }
}
