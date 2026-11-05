import type { EventCost } from '@janus/shared-kernel';

import { BudgetExhaustedError } from './budget-exhausted-error.js';
import type { BudgetSnapshot, BudgetState } from './budget-state.js';

export interface BudgetLimits {
  readonly maxTokens: number;
  readonly maxEur: number;
}

export interface BudgetTransition {
  readonly previous: BudgetState;
  readonly current: BudgetState;
}

/**
 * Per-run spending limit in tokens and EUR. It warns at 80 % and is exhausted at 100 %
 * of whichever limit is closer. The call that crosses 100 % is still charged: the money
 * is already spent, so only later calls are refused.
 */
export class Budget {
  static readonly WARNING_RATIO = 0.8;

  private tokens = 0;
  private eur = 0;

  constructor(private readonly limits: BudgetLimits) {
    if (!(limits.maxTokens > 0) || !(limits.maxEur > 0)) {
      throw new RangeError('Budget limits must be positive');
    }
  }

  get usedTokens(): number {
    return this.tokens;
  }

  get usedEur(): number {
    return this.eur;
  }

  get state(): BudgetState {
    const ratio = Math.max(this.tokens / this.limits.maxTokens, this.eur / this.limits.maxEur);
    if (ratio >= 1) return 'exhausted';
    if (ratio >= Budget.WARNING_RATIO) return 'warning';
    return 'ok';
  }

  assertCanSpend(): void {
    if (this.state === 'exhausted') throw new BudgetExhaustedError(this.snapshot());
  }

  charge(cost: EventCost): BudgetTransition {
    const previous = this.state;
    this.tokens +=
      cost.inputTokens +
      cost.outputTokens +
      cost.cacheReadInputTokens +
      cost.cacheCreationInputTokens;
    this.eur += cost.estimatedEur;
    return { previous, current: this.state };
  }

  snapshot(): BudgetSnapshot {
    return {
      state: this.state,
      usedTokens: this.tokens,
      usedEur: this.eur,
      maxTokens: this.limits.maxTokens,
      maxEur: this.limits.maxEur,
    };
  }
}
