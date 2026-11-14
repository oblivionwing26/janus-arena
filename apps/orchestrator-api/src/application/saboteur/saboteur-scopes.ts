import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { VerifiedScope } from '../../domain/scope/verified-scope.js';
import type { VerifyOwnership } from '../scope/verify-ownership.js';

/**
 * The verified scope of each variant of a run (F4.1, ADR 0020), proved once however many
 * saboteurs ask: the sessions of a variant share one token read back from the target.
 */
export class SaboteurScopes {
  private readonly scopes = new Map<string, Promise<VerifiedScope>>();

  constructor(
    private readonly deps: {
      readonly verify: Pick<VerifyOwnership, 'execute'>;
      /** The target's policy for the origin its variant serves. */
      readonly policyFor: (target: string, origin: string) => ScopePolicy;
    },
  ) {}

  forVariant(input: {
    readonly runId: string;
    readonly target: string;
    readonly variantId: string;
    readonly baseUrl: string;
  }): Promise<VerifiedScope> {
    const key = `${input.runId}/${input.variantId}`;
    const known = this.scopes.get(key);
    if (known !== undefined) return known;
    const proving = this.deps.verify.execute({
      runId: input.runId,
      variantId: input.variantId,
      policy: this.deps.policyFor(input.target, new URL(input.baseUrl).origin),
    });
    this.scopes.set(key, proving);
    // A failed proof is not kept: the next saboteur tries again.
    proving.catch(() => this.scopes.delete(key));
    return proving;
  }
}
