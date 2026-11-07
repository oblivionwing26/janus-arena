import type { VcsWorkspace } from '../vcs/vcs-port.js';

export interface BuildChecksResult {
  readonly passed: boolean;
  /** The end of what the checks printed (lint, typecheck, tests), for the record and a retry. */
  readonly output: string;
  readonly durationMs: number;
}

/**
 * The target's own checks on a workspace (F2.3): lint, typecheck and tests, run in an
 * ephemeral container without network. A failure of the checks is a result, not an error;
 * only the infrastructure failing throws. Every adapter must pass
 * src/test-support/build-checks-contract.ts.
 */
export interface BuildChecksPort {
  run(workspace: VcsWorkspace): Promise<BuildChecksResult>;
}

export const BUILD_CHECKS_PORT = Symbol('BuildChecksPort');
