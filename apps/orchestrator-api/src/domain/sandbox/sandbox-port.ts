import type { VariantSpec } from './variant-spec.js';

export interface RunningVariant {
  /**
   * Base URL of the variant inside the janus-sbx network (ADR 0005). Agent browsers run on
   * that network too; the host cannot reach it.
   */
  readonly baseUrl: string;
}

/**
 * Runs target-app variants in an isolated sandbox with no internet egress.
 * Every adapter must pass src/test-support/sandbox-contract.ts.
 */
export interface SandboxPort {
  /** Builds and starts the variant, resolving once its healthcheck passes. */
  up(variant: VariantSpec): Promise<RunningVariant>;
  /** Stops and removes everything the variant started. Safe to call more than once. */
  down(variantId: string): Promise<void>;
  /** Recent application logs. Throws SandboxNotFoundError if the variant is not up. */
  logs(variantId: string): Promise<string>;
}

export const SANDBOX_PORT = Symbol('SandboxPort');
