import {
  GATE_STAGES,
  newUlid,
  type GateStageName,
  type GateStageOutput,
} from '@janus/shared-kernel';

import { isRunCompleted } from '../../domain/event-store/run-summary.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { GateBudget } from '../../domain/gate/gate-budget.js';
import { gateProgress } from '../../domain/gate/gate-progress.js';
import type { GateStage } from '../../domain/gate/gate-stage-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';

export interface RunJanusGateInput {
  readonly target: string;
  readonly budget: GateBudget;
  /** A gate run to resume; without it a new gate starts. */
  readonly gateRunId?: string;
  /** Hears the gate's run id before the first stage, to resume it if the process dies. */
  readonly onStart?: (gateRunId: string) => void;
}

export interface RunJanusGateResult {
  readonly gateRunId: string;
  readonly outputs: ReadonlyMap<GateStageName, GateStageOutput>;
  /** What every stage did in this call: ran, or was already done and reused. */
  readonly stages: readonly {
    readonly stage: GateStageName;
    readonly status: 'completed' | 'skipped' | 'reused';
  }[];
  readonly spentEur: number;
}

/**
 * The Janus gate (F3.9): SynthLab on A → variant B → A/B → differential audit → Red Team →
 * Blue Team → signed report → pull request, each stage a GateStage. The gate's own run records
 * every stage as gate.stage events, and that log is the only state: resuming a gate skips the
 * stages it completed or skipped and hands their recorded outputs on, so a gate killed in the
 * Blue Team never plays SynthLab again. A stage caught half-way runs again from its start. The
 * global budget is split by stage (GateBudget); what the gate spent is read from the cost of
 * the runs its stages started. A gate that has not finished has no run.completed.
 */
export class RunJanusGate {
  constructor(
    private readonly deps: {
      readonly store: EventStorePort;
      readonly stages: readonly GateStage[];
    },
  ) {
    const names = deps.stages.map((stage) => stage.name);
    if (names.join() !== GATE_STAGES.join()) {
      throw new Error(`The gate needs one stage of each, in order: ${GATE_STAGES.join(', ')}`);
    }
  }

  async execute(input: RunJanusGateInput): Promise<RunJanusGateResult> {
    const { store } = this.deps;
    const gateRunId = input.gateRunId ?? newUlid();
    const existing = input.gateRunId === undefined ? [] : await store.readRun(gateRunId);
    if (input.gateRunId !== undefined) {
      if (existing.length === 0) throw new Error(`Gate run ${gateRunId} has no events`);
      if (existing.some(isRunCompleted)) throw new Error(`Gate run ${gateRunId} already finished`);
    }
    const gate = new RunEventRecorder(store, gateRunId, ORCHESTRATOR_ACTOR, {
      startSeq: (existing.at(-1)?.seq ?? -1) + 1,
    });
    if (existing.length === 0) {
      await gate.record('run.started', {
        budget: { maxTokens: 50_000_000, maxEur: input.budget.totalEur },
        target: input.target,
      });
    }

    input.onStart?.(gateRunId);
    const progress = gateProgress(existing);
    const outputs = new Map<GateStageName, GateStageOutput>();
    const done: RunJanusGateResult['stages'][number][] = [];
    for (const stage of this.deps.stages) {
      const before = progress.get(stage.name) ?? { status: 'pending', runs: [] };
      if (before.status === 'completed') {
        outputs.set(stage.name, before.output);
        done.push({ stage: stage.name, status: 'reused' });
        continue;
      }
      if (before.status === 'skipped') {
        done.push({ stage: stage.name, status: 'reused' });
        continue;
      }

      const runs = [...before.runs];
      if (!stage.resumesRuns) await this.closeInterrupted(runs, gateRunId);
      const spent = await this.spent(gateRunId);
      const allowanceEur = input.budget.allowance(stage.name, spent);
      await gate.record('gate.stage', { stage: stage.name, status: 'started', allowanceEur });
      try {
        const result = await stage.run({
          gateRunId,
          outputs: new Map(outputs),
          allowanceEur,
          interrupted: before.runs,
          onRun: async (runId) => {
            if (runs.includes(runId)) return;
            runs.push(runId);
            await gate.record('gate.stage', { stage: stage.name, status: 'run', runId });
          },
        });
        if (result.status === 'skipped') {
          await gate.record('gate.stage', {
            stage: stage.name,
            status: 'skipped',
            reason: result.reason,
          });
          done.push({ stage: stage.name, status: 'skipped' });
          continue;
        }
        outputs.set(stage.name, result.output);
        await gate.record('gate.stage', {
          stage: stage.name,
          status: 'completed',
          output: result.output,
          spentEur: await this.costOf(runs),
        });
        done.push({ stage: stage.name, status: 'completed' });
      } catch (error) {
        const reason = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
        await gate.record('gate.stage', {
          stage: stage.name,
          status: 'failed',
          reason: reason === '' ? 'failed' : reason,
        });
        throw error;
      }
    }

    const spentEur = await this.spent(gateRunId);
    await gate.record('run.completed', { outcome: 'success' });
    return { gateRunId, outputs, stages: done, spentEur };
  }

  /** What every run the gate's stages started has cost, from every attempt. */
  private async spent(gateRunId: string): Promise<number> {
    const runs = [...gateProgress(await this.deps.store.readRun(gateRunId)).values()].flatMap(
      (each) => each.runs,
    );
    return this.costOf(runs);
  }

  private async costOf(runs: readonly string[]): Promise<number> {
    let total = 0;
    for (const runId of runs) {
      for (const event of await this.deps.store.readRun(runId)) {
        total += event.cost?.estimatedEur ?? 0;
      }
    }
    return total;
  }

  /** The runs an interrupted attempt left open end as errors: nothing will finish them. */
  private async closeInterrupted(runs: readonly string[], gateRunId: string): Promise<void> {
    for (const runId of runs) {
      const events = await this.deps.store.readRun(runId);
      if (events.length === 0 || events.some(isRunCompleted)) continue;
      await new RunEventRecorder(this.deps.store, runId, ORCHESTRATOR_ACTOR, {
        startSeq: (events.at(-1)?.seq ?? -1) + 1,
      }).record('run.completed', {
        outcome: 'error',
        reason: `interrupted: gate ${gateRunId} stopped while this run was in progress`,
      });
    }
  }
}
