// The benchmark's rounds on Juice Shop (F3.11): each one a fresh instance of the pinned image in
// the sandbox, with the target's ownership verified, then either nothing (the control) or the
// Red Team with every class. The challenges are read afterwards, by the orchestrator only.

import { newUlid, RED_TEAM_CLASSES, type RedTeamClass } from '@janus/shared-kernel';

import { RunRedTeam } from '../../application/red-team/run-red-team.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { VerifyOwnership } from '../../application/scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type {
  BenchmarkRoundPort,
  BenchmarkRoundResult,
} from '../../domain/benchmark/benchmark-round-port.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import { Budget } from '../../domain/llm/budget.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import type { OwnershipTokenPort } from '../../domain/scope/ownership-token-port.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import type { ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { JuiceShopChallenges } from '../../infrastructure/attack/juice-shop-challenges.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';

/** The engine is deterministic (ADR 0011): this gateway is never called, and says so if it is. */
export const NO_MODEL: LLMGatewayPort = {
  complete: () => Promise.reject(new Error('The benchmark calls no model')),
};

export class JuiceShopBenchmarkRounds implements BenchmarkRoundPort {
  constructor(
    private readonly deps: {
      readonly store: EventStorePort;
      readonly sandbox: SandboxPort & OwnershipTokenPort;
      readonly http: ScopedHttpPort;
      readonly browser: BrowserAttackPort;
      readonly target: string;
      /** What the engine works from, read once from a throwaway clone of the target's code. */
      readonly endpoints: readonly Endpoint[];
      readonly leads: readonly StaticFinding[];
      readonly surface: { readonly ref: string; readonly sha: string };
      readonly policyFor: (origin: string) => ScopePolicy;
      readonly classes?: readonly RedTeamClass[];
      readonly onProgress?: (message: string) => void;
    },
  ) {}

  control(): Promise<BenchmarkRoundResult> {
    return this.round(false);
  }

  attack(): Promise<BenchmarkRoundResult> {
    return this.round(true);
  }

  private async round(attack: boolean): Promise<BenchmarkRoundResult> {
    const { store, sandbox, http, browser, target } = this.deps;
    const started = Date.now();
    const runId = newUlid();
    const variantId = `${attack ? 'bench' : 'ctrl'}-${runId.slice(-8).toLowerCase()}`;
    const orchestrator = new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR);
    const budget = { maxTokens: 1_000_000, maxEur: 1 };
    await orchestrator.record('run.started', { budget, target });
    let outcome: 'success' | 'error' = 'error';
    let reason = 'the round did not finish';
    try {
      const { baseUrl } = await sandbox.up({ id: variantId, target, ref: 'image' });
      const origin = new URL(baseUrl).origin;
      const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
        runId,
        variantId,
        policy: this.deps.policyFor(origin),
      });
      let findings: string[] = [];
      if (attack) {
        const result = await new RunRedTeam({
          gateway: NO_MODEL,
          store,
          http,
          target: (client, at) => ({
            users: new JuiceShopTestUsers(client, at),
            victim: new JuiceShopVictimData(client, at),
            businessLogic: new JuiceShopBusinessLogic(client, at),
          }),
          browser,
          artifacts: new FileArtifactStore(),
        }).execute({
          runId,
          scope,
          origin,
          classes: this.deps.classes ?? RED_TEAM_CLASSES,
          endpoints: this.deps.endpoints,
          surface: this.deps.surface,
          findings: this.deps.leads,
          engine: 'deterministic',
          budget: new Budget(budget),
        });
        const confirmed = new Set(result.confirmed);
        findings = result.findings
          .filter((finding) => confirmed.has(finding.findingId))
          .map((finding) => finding.testType);
      }
      const challenges = await new JuiceShopChallenges(http, origin).all();
      outcome = 'success';
      reason = '';
      this.deps.onProgress?.(
        `${attack ? 'attack' : 'control'} round done: ${String(challenges.filter((each) => each.solved).length)} challenges solved by the target's count`,
      );
      const costEur = (await store.readRun(runId)).reduce(
        (sum, event) => sum + (event.cost?.estimatedEur ?? 0),
        0,
      );
      return {
        challenges,
        runId,
        findings,
        durationMs: Date.now() - started,
        costEur,
      };
    } catch (error) {
      reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
      throw error;
    } finally {
      await orchestrator.record('run.completed', {
        outcome,
        ...(reason === '' ? {} : { reason }),
      });
      await sandbox.down(variantId);
    }
  }
}
