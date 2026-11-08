/**
 * Puts a run's verification token where the target serves it, at /.well-known/janus-verify.txt
 * (F3.1). Janus does this itself only for targets it runs in the sandbox; anyone else's target
 * proves ownership by publishing the token.
 */
export interface OwnershipTokenPort {
  /** Writes the token for the running variant; SandboxNotFoundError if it is not up. */
  place(variantId: string, token: string): Promise<void>;
}

export const OWNERSHIP_TOKEN_PORT = Symbol('OwnershipTokenPort');
