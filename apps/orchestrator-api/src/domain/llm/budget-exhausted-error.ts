import { DomainError } from '../errors/domain-error.js';
import type { BudgetSnapshot } from './budget-state.js';

export class BudgetExhaustedError extends DomainError {
  readonly code = 'llm.budget-exhausted';

  constructor(readonly snapshot: BudgetSnapshot) {
    super(
      `Budget exhausted: ${String(snapshot.usedTokens)}/${String(snapshot.maxTokens)} tokens, ` +
        `${snapshot.usedEur.toFixed(4)}/${snapshot.maxEur.toFixed(4)} EUR`,
    );
  }
}
