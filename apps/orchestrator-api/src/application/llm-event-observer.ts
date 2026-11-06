import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type {
  BudgetThresholdRecord,
  LlmCallObserver,
  LlmCallRecord,
} from '../domain/llm/llm-call-observer.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from './start-run.js';

/**
 * Turns what the gateway observed into events: `llm.call` with its cost, from the agent that
 * made the call, and `budget.threshold` from the orchestrator, which owns the run's budget.
 */
export class LlmEventObserver implements LlmCallObserver {
  constructor(private readonly store: EventStorePort) {}

  async onLlmCall(record: LlmCallRecord): Promise<void> {
    const recorder = new RunEventRecorder(this.store, record.runId, {
      agentId: record.agentId,
      role: record.role,
    });
    await recorder.record(
      'llm.call',
      {
        role: record.role,
        model: record.model,
        durationMs: record.durationMs,
        requestHash: record.requestHash,
      },
      { cost: record.cost },
    );
  }

  async onBudgetThreshold(record: BudgetThresholdRecord): Promise<void> {
    const { usedTokens, usedEur, maxTokens, maxEur } = record.snapshot;
    const recorder = new RunEventRecorder(this.store, record.runId, ORCHESTRATOR_ACTOR);
    await recorder.record('budget.threshold', {
      level: record.level,
      usedTokens,
      usedEur,
      maxTokens,
      maxEur,
    });
  }
}
