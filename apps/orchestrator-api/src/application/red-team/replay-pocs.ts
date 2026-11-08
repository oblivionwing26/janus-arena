import { RED_TEAM_CLASSES, type ProofOfConcept } from '@janus/shared-kernel';

import type { AttackTargetFactory } from '../../domain/attack/attack-target.js';
import { AttemptLimits } from '../../domain/attack/attempt-limits.js';
import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';
import type { VerifiedScope } from '../../domain/scope/verified-scope.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { recordBlocked } from '../scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { AttackBench } from './attack-bench.js';
import { PocRunner } from './poc-runner.js';

export interface ReplayedPoc {
  readonly poc: ProofOfConcept;
  /** The oracle's verdict on the replay; null when nothing could be judged. */
  readonly verdict: OracleVerdict | null;
}

/**
 * Replays saved PoCs against a target in a scope verified for this run (F3.4): one bench with
 * fresh test users, no new findings, every attempt and verdict recorded. This is the check the
 * PoC CI runs, and what the Blue Team's first verifier needs (F3.5: "the original PoC is no
 * longer exploitable"). No LLM is called.
 */
export class ReplayPocs {
  constructor(
    private readonly deps: {
      readonly store: EventStorePort;
      readonly http: ScopedHttpPort;
      readonly target: AttackTargetFactory;
      readonly browser?: BrowserAttackPort;
    },
  ) {}

  async execute(input: {
    readonly runId: string;
    readonly scope: VerifiedScope;
    readonly origin: string;
    readonly pocs: readonly ProofOfConcept[];
  }): Promise<readonly ReplayedPoc[]> {
    const orchestrator = new RunEventRecorder(this.deps.store, input.runId, ORCHESTRATOR_ACTOR);
    const client = this.deps.http.client(
      new NetworkGuard(input.scope),
      recordBlocked(orchestrator),
    );
    const bench = await AttackBench.open({
      runId: input.runId,
      origin: input.origin,
      classes: RED_TEAM_CLASSES,
      client,
      target: this.deps.target(client, input.origin),
      // Each PoC is one move; the limits only stop a runaway list.
      limits: new AttemptLimits([], { perEndpoint: 10, total: 100 }),
      orchestrator,
      agent: new RunEventRecorder(this.deps.store, input.runId, {
        agentId: `poc-${input.runId.slice(-6).toLowerCase()}`,
        role: 'red-team',
      }),
      targetName: input.scope.policy.target,
      recordFindings: false,
    });
    const runner = new PocRunner({ browser: this.deps.browser ?? null });
    const replayed: ReplayedPoc[] = [];
    for (const poc of input.pocs) {
      replayed.push({ poc, verdict: await runner.replay(bench, poc) });
    }
    return replayed;
  }
}
