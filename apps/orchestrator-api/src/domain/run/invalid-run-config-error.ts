import { DomainError } from '../errors/domain-error.js';

export class InvalidRunConfigError extends DomainError {
  readonly code = 'run.invalid-config';
}
