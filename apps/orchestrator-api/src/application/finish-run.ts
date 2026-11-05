import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { isRunCompleted } from '../domain/event-store/run-summary.js';
import { decideOutcome } from '../domain/run/decide-outcome.js';
import type { RunPlan, SessionResult } from '../domain/run/session-queue-port.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import type { RunControl } from './run-control.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from './start-run.js';

export interface FinishRunDeps {
  readonly store: EventStorePort;
  readonly sandbox: SandboxPort;
  readonly control: RunControl;
}

/** Closes a run once every session has a result: run.completed, then the variant goes down. */
export class FinishRun {
  constructor(private readonly deps: FinishRunDeps) {}

  async execute(plan: RunPlan, results: readonly SessionResult[]): Promise<void> {
    const { store, sandbox, control } = this.deps;
    const alreadyCompleted = (await store.readRun(plan.runId)).some(isRunCompleted);
    if (!alreadyCompleted) {
      const verdict = decideOutcome(results);
      await new RunEventRecorder(store, plan.runId, ORCHESTRATOR_ACTOR).record('run.completed', {
        outcome: verdict.outcome,
        ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
      });
    }
    await sandbox.down(plan.variantId);
    control.release(plan.runId);
  }
}
