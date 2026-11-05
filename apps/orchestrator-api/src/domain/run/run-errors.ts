import { DomainError } from '../errors/domain-error.js';

/** The platform failed (browser, sandbox, network), not the agent. Retried, never friction. */
export class InfrastructureError extends DomainError {
  readonly code = 'infrastructure';
}

export class RunNotFoundError extends DomainError {
  readonly code = 'run.not-found';

  constructor(readonly runId: string) {
    super(`Run ${runId} does not exist`);
  }
}
