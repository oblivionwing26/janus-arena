import type { GateStageName, GateStageOutput } from '@janus/shared-kernel';

export interface GateStageContext {
  readonly gateRunId: string;
  /** The outputs of the stages completed before this one. */
  readonly outputs: ReadonlyMap<GateStageName, GateStageOutput>;
  /** What this stage may spend: its share plus what the earlier stages left. */
  readonly allowanceEur: number;
  /**
   * Runs an earlier, interrupted attempt of this stage started. A stage that `resumesRuns`
   * waits for them instead of starting again; for the others the gate has closed them.
   */
  readonly interrupted: readonly string[];
  /** Tell the gate about a run the stage starts, before waiting for it. */
  readonly onRun: (runId: string) => Promise<void>;
}

export type GateStageResult =
  | { readonly status: 'completed'; readonly output: GateStageOutput }
  | { readonly status: 'skipped'; readonly reason: string };

/**
 * One stage of the Janus gate (F3.9): SynthLab on A, variant B, the A/B, the differential
 * audit, the Red Team, the Blue Team, the report and the pull request. Adapters wrap the use
 * cases of earlier steps; a stage the target cannot do says so with `skipped`.
 */
export interface GateStage {
  readonly name: GateStageName;
  /** Its runs keep going without this process (SynthLab on the orchestrator) and can be awaited. */
  readonly resumesRuns?: boolean;
  run(context: GateStageContext): Promise<GateStageResult>;
}
