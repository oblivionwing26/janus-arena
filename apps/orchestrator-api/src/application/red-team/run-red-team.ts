import {
  HTTP_RED_TEAM_CLASSES,
  type HttpRedTeamClass,
  type RedTeamClass,
} from '@janus/shared-kernel';

import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { AttackTargetFactory } from '../../domain/attack/attack-target.js';
import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import {
  AttemptLimits,
  DEFAULT_ATTEMPT_LIMITS,
  type AttemptLimitConfig,
} from '../../domain/attack/attempt-limits.js';
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
import { AttackBench, type RedTeamFinding } from './attack-bench.js';
import { agentHandlers } from './agent-handlers.js';
import { DeterministicEngine } from './deterministic-engine.js';
import { RedTeamAgent } from './red-team-agent.js';
import { redTeamBrief, redTeamSystem } from './red-team-prompt.js';

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
}

/**
 * A Red Team run against a sandboxed target (F3.3, ADR 0011). The deterministic engine generates
 * attacks from the surface map; a deterministic oracle decides every attempt. The LLM agent is
 * kept behind `engine: 'agent'`, off by default, because the provider declines it. Both drive
 * the same attack bench, so they record the same events and findings.
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

    const bench = await AttackBench.open({
      runId: input.runId,
      origin: input.origin,
      classes: input.classes,
      client,
      target: this.deps.target(client, input.origin),
      limits: new AttemptLimits(input.endpoints, input.limits ?? DEFAULT_ATTEMPT_LIMITS),
      orchestrator,
      agent,
    });

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

    return { engine, summary, attempts: bench.attempts.length, findings: bench.findings };
  }
}
