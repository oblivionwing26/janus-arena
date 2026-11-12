import type { GeneratedTest } from './generated-test.js';
import type { TestResults } from './judge-tests.js';

/**
 * Runs a target's own tests on one commit of a local clone, with Janus's generated tests added,
 * without network (F3.5, V2). Throws InfrastructureError when the tests cannot be run at all.
 */
export interface TargetTestsPort {
  run(input: {
    readonly target: string;
    /** A local file:// clone inside the workspaces folder. */
    readonly repo: string;
    /** A full commit id of that clone. */
    readonly commit: string;
    readonly extra: readonly GeneratedTest[];
  }): Promise<TestResults>;
}
