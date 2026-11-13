import type {
  OpenedPullRequest,
  PullRequestInput,
  PullRequestPort,
} from '../../domain/vcs/pull-request-port.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';

/** Fake PullRequestPort for tests: pull requests kept in memory, one per branch. */
export class InMemoryPullRequests implements PullRequestPort {
  readonly opened: (PullRequestInput & { readonly number: number })[] = [];

  open(input: PullRequestInput): Promise<OpenedPullRequest> {
    try {
      JanusBranch.assert(input.branch);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const existing = this.opened.find(
      (each) =>
        each.owner === input.owner && each.repo === input.repo && each.branch === input.branch,
    );
    const number = existing?.number ?? this.opened.length + 1;
    if (existing === undefined) this.opened.push({ ...input, number });
    return Promise.resolve({
      number,
      url: `https://forge.invalid/${input.owner}/${input.repo}/pull/${String(number)}`,
      base: 'main',
      existed: existing !== undefined,
    });
  }
}
