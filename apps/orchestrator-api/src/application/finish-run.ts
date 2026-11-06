import { defaultFrictionConfig, detectFriction, type FrictionConfig } from '@janus/friction-engine';
import { isKnownEvent } from '@janus/shared-kernel';

import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { isRunCompleted } from '../domain/event-store/run-summary.js';
import { decideOutcome } from '../domain/run/decide-outcome.js';
import type { RunPlan, SessionResult, SessionStatus } from '../domain/run/session-queue-port.js';
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
      // Only sessions that ended count: an attempt cut short by the platform and retried as a
      // new session is excluded from friction, like from the statistics.
      const ended = new Set(
        events.flatMap((event) =>
          isKnownEvent(event) && event.type === 'session.ended' ? [event.actor.agentId] : [],
        ),
      );
      const finished = events.filter(
        (event) => event.actor.role === 'orchestrator' || ended.has(event.actor.agentId),
      );
      for (const signal of detectFriction(finished, this.deps.friction ?? defaultFrictionConfig)) {
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
      const count = (status: SessionStatus) => results.filter((r) => r.status === status).length;
      await recorder.record('run.completed', {
        outcome: verdict.outcome,
        ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
        sessions: {
          total: results.length,
          completed: count('completed'),
          failed: count('failed'),
          budgetExhausted: count('budget_exhausted'),
          cancelled: count('cancelled'),
          excluded: count('infra_error'),
        },
      });
    }
    await Promise.all(plan.variants.map((variant) => sandbox.down(variant.variantId)));
    control.release(plan.runId);
  }
}
