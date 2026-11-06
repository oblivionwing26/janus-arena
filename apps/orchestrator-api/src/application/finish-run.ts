import { defaultFrictionConfig, detectFriction, type FrictionConfig } from '@janus/friction-engine';

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
  /** Thresholds from config/friction.yaml; the engine's defaults otherwise. */
  readonly friction?: FrictionConfig;
}

/**
 * Closes a run once every session has a result: its friction signals (computed by code from
 * the run's events, F1.6), run.completed, then the variant goes down.
 */
export class FinishRun {
  constructor(private readonly deps: FinishRunDeps) {}

  async execute(plan: RunPlan, results: readonly SessionResult[]): Promise<void> {
    const { store, sandbox, control } = this.deps;
    const events = await store.readRun(plan.runId);
    if (!events.some(isRunCompleted)) {
      const recorder = new RunEventRecorder(store, plan.runId, ORCHESTRATOR_ACTOR);
      for (const signal of detectFriction(events, this.deps.friction ?? defaultFrictionConfig)) {
        await recorder.record('friction.signal', {
          detector: signal.detector,
          severity: signal.severity,
          evidenceEventIds: [...signal.evidenceEventIds],
          agentId: signal.agentId,
          ...(signal.stepIndex === undefined ? {} : { stepIndex: signal.stepIndex }),
          ...(signal.url === undefined ? {} : { url: signal.url }),
        });
      }
      const verdict = decideOutcome(results);
      await recorder.record('run.completed', {
        outcome: verdict.outcome,
        ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
      });
    }
    await sandbox.down(plan.variantId);
    control.release(plan.runId);
  }
}
