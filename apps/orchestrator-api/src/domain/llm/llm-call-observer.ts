import type { EventCost, ModelRole } from '@janus/shared-kernel';

import type { BudgetSnapshot } from './budget-state.js';

export interface LlmCallRecord {
  readonly runId: string;
  readonly agentId: string;
  readonly role: ModelRole;
  readonly model: string;
  readonly durationMs: number;
  readonly requestHash: string;
  readonly cost: EventCost;
}

export interface BudgetThresholdRecord {
  readonly runId: string;
  readonly agentId: string;
  readonly level: 'warning' | 'exhausted';
  readonly snapshot: BudgetSnapshot;
}

/**
 * Receives what the gateway observed so it can become `llm.call` and `budget.threshold`
 * events. F0.10 wires it to the event store, which assigns seq.
 */
export interface LlmCallObserver {
  onLlmCall(record: LlmCallRecord): Promise<void>;
  onBudgetThreshold(record: BudgetThresholdRecord): Promise<void>;
}

export const LLM_CALL_OBSERVER = Symbol('LlmCallObserver');
