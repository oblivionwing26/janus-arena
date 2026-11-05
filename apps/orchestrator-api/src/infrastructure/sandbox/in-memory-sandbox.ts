import {
  SandboxAlreadyUpError,
  SandboxNotFoundError,
} from '../../domain/sandbox/sandbox-errors.js';
import type { RunningVariant, SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import { assertValidVariant, type VariantSpec } from '../../domain/sandbox/variant-spec.js';

// Fake adapter for unit tests: tracks variants without starting anything.
export class InMemorySandbox implements SandboxPort {
  private readonly running = new Map<string, VariantSpec>();

  up(variant: VariantSpec): Promise<RunningVariant> {
    try {
      assertValidVariant(variant);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    if (this.running.has(variant.id)) {
      return Promise.reject(new SandboxAlreadyUpError(variant.id));
    }
    this.running.set(variant.id, variant);
    return Promise.resolve({ baseUrl: `http://janus-${variant.id}-app.sandbox.invalid` });
  }

  down(variantId: string): Promise<void> {
    this.running.delete(variantId);
    return Promise.resolve();
  }

  logs(variantId: string): Promise<string> {
    const variant = this.running.get(variantId);
    if (variant === undefined) return Promise.reject(new SandboxNotFoundError(variantId));
    return Promise.resolve(`in-memory ${variant.target}@${variant.ref}\n`);
  }
}
