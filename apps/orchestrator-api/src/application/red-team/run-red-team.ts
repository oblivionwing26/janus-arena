import {
  HTTP_RED_TEAM_CLASSES,
  type HttpRedTeamClass,
  type RedTeamClass,
} from '@janus/shared-kernel';

import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { ArtifactStorePort } from '../../domain/artifacts/artifact-store-port.js';
import type { AttackTargetFactory } from '../../domain/attack/attack-target.js';
import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import {
  AttemptLimits,
  DEFAULT_ATTEMPT_LIMITS,
  type AttemptLimitConfig,
} from '../../domain/attack/attempt-limits.js';
import { confirmFinding, FindingNotConfirmableError } from '../../domain/attack/confirm-finding.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { Budget } from '../../domain/llm/budget.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';
import type { VerifiedScope } from '../../domain/scope/verified-scope.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { recordBlocked } from '../scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { AttackBench, type AttackBenchDeps, type RedTeamFinding } from './attack-bench.js';
import { agentHandlers } from './agent-handlers.js';
import { DeterministicEngine } from './deterministic-engine.js';
import { PocRunner } from './poc-runner.js';
import { RedTeamAgent } from './red-team-agent.js';
import { redTeamBrief, redTeamSystem } from './red-team-prompt.js';

/** Where a finding's PoC is saved in its run's artifacts (keys are lower case). */
export const pocKey = (findingId: string): string => `poc/${findingId.toLowerCase()}.json`;

/** The deterministic engine is the default; the LLM agent is kept but off (ADR 0011). */
export type RedTeamEngine = 'deterministic' | 'agent';

export interface RunRedTeamInput {
  readonly runId: string;
  /** Offensive modules start only with a verified scope (F3.1). */
  readonly scope: VerifiedScope;
  readonly origin: string;
  readonly classes: readonly RedTeamClass[];
  readonly endpoints: readonly Endpoint[];
  readonly findings: readonly StaticFinding[];
  readonly budget: Budget;
  readonly engine?: RedTeamEngine;
  readonly limits?: AttemptLimitConfig;
}

export interface RunRedTeamResult {
  readonly engine: RedTeamEngine;
  readonly summary: string;
  readonly attempts: number;
  readonly findings: readonly RedTeamFinding[];
  /** Findings whose PoC reproduced with fresh test users, now `confirmed` (F3.4). */
  readonly confirmed: readonly string[];
  /** Findings whose PoC did not reproduce, with why; they stay `suspected`. */
  readonly unconfirmed: readonly { readonly findingId: string; readonly reason: string }[];
}

/**
 * A Red Team run against a sandboxed target (F3.3, ADR 0011). The deterministic engine generates
 * attacks from the surface map; a deterministic oracle decides every attempt. The LLM agent is
 * kept behind `engine: 'agent'`, off by default, because the provider declines it. Both drive
 * the same attack bench, so they record the same events and findings. Then each finding's PoC is
 * saved as an artifact and replayed with fresh test users; only a PoC that reproduces makes its
 * finding `confirmed` (F3.4).
 */
export class RunRedTeam {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly store: EventStorePort;
      readonly http: ScopedHttpPort;
      readonly target: AttackTargetFactory;
      /** The browser for XSS; without it the engine skips that class. */
      readonly browser?: BrowserAttackPort;
      /** Where PoCs are saved; without it findings are not replayed and stay `suspected`. */
      readonly artifacts?: ArtifactStorePort;
    },
  ) {}

  async execute(input: RunRedTeamInput): Promise<RunRedTeamResult> {
    const engine = input.engine ?? 'deterministic';
    const agentId = `red-team-${input.runId.slice(-6).toLowerCase()}`;
    const orchestrator = new RunEventRecorder(this.deps.store, input.runId, ORCHESTRATOR_ACTOR);
    const agent = new RunEventRecorder(this.deps.store, input.runId, {
      agentId,
      role: 'red-team',
    });
    const client = this.deps.http.client(
      new NetworkGuard(input.scope),
      recordBlocked(orchestrator),
    );

    const benchDeps: AttackBenchDeps = {
      runId: input.runId,
      origin: input.origin,
      classes: input.classes,
      client,
      target: this.deps.target(client, input.origin),
      limits: new AttemptLimits(input.endpoints, input.limits ?? DEFAULT_ATTEMPT_LIMITS),
      orchestrator,
      agent,
      targetName: input.scope.policy.target,
    };
    const bench = await AttackBench.open(benchDeps);

    let summary: string;
    if (engine === 'deterministic') {
      ({ summary } = await new DeterministicEngine({ browser: this.deps.browser ?? null }).run(
        bench,
        { runId: input.runId, classes: input.classes, endpoints: input.endpoints },
      ));
    } else {
      // The agent's tool sends one HTTP request; it only takes the one-request classes.
      const classes = input.classes.filter((cls): cls is HttpRedTeamClass =>
        (HTTP_RED_TEAM_CLASSES as readonly string[]).includes(cls),
      );
      const result = await new RedTeamAgent({ gateway: this.deps.gateway }).run({
        runId: input.runId,
        agentId,
        system: redTeamSystem(classes, input.endpoints, input.findings),
        brief: redTeamBrief({
          email: bench.attacker.user.email,
          userId: bench.attacker.user.userId,
          basketId: bench.attacker.basketId,
        }),
        handlers: agentHandlers(bench),
        budget: input.budget,
      });
      summary = `${result.outcome}: ${result.summary}`;
    }

    const { confirmed, unconfirmed } = await this.confirm(bench, benchDeps, input);
    return {
      engine,
      summary,
      attempts: bench.attempts.length,
      findings: bench.findings,
      confirmed,
      unconfirmed,
    };
  }

  /**
   * Saves each finding's PoC and replays it on a bench with fresh test users and fresh limits,
   * which records attempts and verdicts but never new findings. A PoC that reproduces records
   * `finding.confirmed`; one that does not leaves its finding `suspected`, with the reason.
   */
  private async confirm(
    bench: AttackBench,
    benchDeps: AttackBenchDeps,
    input: RunRedTeamInput,
  ): Promise<Pick<RunRedTeamResult, 'confirmed' | 'unconfirmed'>> {
    const { artifacts } = this.deps;
    if (artifacts === undefined || bench.findings.length === 0) {
      return { confirmed: [], unconfirmed: [] };
    }
    const replayBench = await AttackBench.open({
      ...benchDeps,
      limits: new AttemptLimits(input.endpoints, input.limits ?? DEFAULT_ATTEMPT_LIMITS),
      recordFindings: false,
    });
    const runner = new PocRunner({ browser: this.deps.browser ?? null });
    const confirmed: string[] = [];
    const unconfirmed: { findingId: string; reason: string }[] = [];
    for (const finding of bench.findings) {
      const pocRef = pocKey(finding.findingId);
      await artifacts.put(
        input.runId,
        pocRef,
        new TextEncoder().encode(`${JSON.stringify(finding.poc, null, 2)}\n`),
      );
      try {
        const confirmation = confirmFinding(finding.findingId, {
          pocRef,
          replay: await runner.replay(replayBench, finding.poc),
        });
        await benchDeps.orchestrator.record('finding.confirmed', {
          ...confirmation,
          evidence: confirmation.evidence.slice(0, 500),
        });
        confirmed.push(finding.findingId);
      } catch (error) {
        if (!(error instanceof FindingNotConfirmableError)) throw error;
        unconfirmed.push({ findingId: finding.findingId, reason: error.message });
      }
    }
    return { confirmed, unconfirmed };
  }
}
