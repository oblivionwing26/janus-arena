import { DomainError } from '../errors/domain-error.js';
import type { ScopePolicy } from './scope-policy.js';

export const VERIFICATION_PATH = '/.well-known/janus-verify.txt';

export class OwnershipNotVerifiedError extends DomainError {
  readonly code = 'scope.ownership-not-verified';
}

/**
 * A scope whose target proved it is ours (F3.1, ADR 0005): every origin served the run's token
 * at /.well-known/janus-verify.txt. Offensive modules take one in their signature, so none can
 * start without it, and only VerifiedScope.verify() creates one.
 */
export class VerifiedScope {
  private constructor(
    readonly policy: ScopePolicy,
    readonly verifiedAt: string,
  ) {}

  /**
   * The scope, verified, when every origin served exactly the expected token; otherwise
   * OwnershipNotVerifiedError naming the first origin that did not.
   */
  static verify(
    policy: ScopePolicy,
    token: string,
    served: ReadonlyMap<string, string | null>,
    verifiedAt: string,
  ): VerifiedScope {
    if (token.length < 16) {
      throw new OwnershipNotVerifiedError('The verification token is too short');
    }
    for (const origin of policy.origins) {
      const body = served.get(origin);
      if (body === undefined || body === null) {
        throw new OwnershipNotVerifiedError(`${origin} does not serve ${VERIFICATION_PATH}`);
      }
      if (body.trim() !== token) {
        throw new OwnershipNotVerifiedError(`${origin} serves a different verification token`);
      }
    }
    return new VerifiedScope(policy, verifiedAt);
  }
}
