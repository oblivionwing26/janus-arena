import { DomainError } from '../errors/domain-error.js';

export class InvalidGateBudgetError extends DomainError {
  readonly code = 'gate.invalid-budget';

  constructor(reason: string) {
    super(`Invalid gate budget: ${reason}`);
  }
}
