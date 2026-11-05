import { DomainError } from '../errors/domain-error.js';

export class SandboxAlreadyUpError extends DomainError {
  readonly code = 'sandbox.already-up';

  constructor(readonly variantId: string) {
    super(`Variant ${variantId} is already up`);
  }
}

export class SandboxNotFoundError extends DomainError {
  readonly code = 'sandbox.not-found';

  constructor(readonly variantId: string) {
    super(`Variant ${variantId} is not up`);
  }
}

export class SandboxStartError extends DomainError {
  readonly code = 'sandbox.start-failed';

  constructor(
    readonly variantId: string,
    detail: string,
  ) {
    super(`Variant ${variantId} failed to start: ${detail}`);
  }
}
