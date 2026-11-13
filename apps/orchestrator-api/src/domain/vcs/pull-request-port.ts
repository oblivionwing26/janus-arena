import type { VcsWorkspace } from './vcs-port.js';

export interface PullRequestInput {
  /** The repository on the forge, e.g. `oblivionwing26` / `janus-shoplab`. */
  readonly owner: string;
  readonly repo: string;
  /** A `janus/variant-<runId>` or `janus/fix-<findingId>` branch of the workspace. */
  readonly branch: string;
  readonly workspace: VcsWorkspace;
  readonly title: string;
  readonly body: string;
}

export interface OpenedPullRequest {
  readonly number: number;
  readonly url: string;
  /** The branch it asks to merge into: the repository's default branch. */
  readonly base: string;
  /** True when a pull request for the branch was already open, and this is it. */
  readonly existed: boolean;
}

/**
 * Hands a Janus branch to a human (F3.8, CLAUDE.md): pushes it and opens a pull request into the
 * repository's default branch, or returns the one already open. Janus never merges and never
 * approves: the port has no way to, on purpose. Throws InvalidBranchNameError for any other
 * branch and InfrastructureError when the forge refuses. Every adapter must pass
 * src/test-support/pull-request-contract.ts.
 */
export interface PullRequestPort {
  open(input: PullRequestInput): Promise<OpenedPullRequest>;
}
