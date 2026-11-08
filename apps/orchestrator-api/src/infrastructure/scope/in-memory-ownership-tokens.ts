import { SandboxNotFoundError } from '../../domain/sandbox/sandbox-errors.js';
import type { OwnershipTokenPort } from '../../domain/scope/ownership-token-port.js';

/** Remembers each variant's token, for a fake target to serve. */
export class InMemoryOwnershipTokens implements OwnershipTokenPort {
  readonly tokens = new Map<string, string>();

  constructor(private readonly running: ReadonlySet<string>) {}

  place(variantId: string, token: string): Promise<void> {
    if (!this.running.has(variantId)) {
      return Promise.reject(new SandboxNotFoundError(variantId));
    }
    this.tokens.set(variantId, token);
    return Promise.resolve();
  }
}
