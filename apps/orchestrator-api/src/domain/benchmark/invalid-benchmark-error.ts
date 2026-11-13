import { DomainError } from '../errors/domain-error.js';

export class InvalidBenchmarkError extends DomainError {
  readonly code = 'benchmark.invalid';

  constructor(reason: string) {
    super(`Invalid benchmark: ${reason}`);
  }
}
