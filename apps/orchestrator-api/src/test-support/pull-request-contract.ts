// Shared contract suite for PullRequestPort (F3.8): the in-memory fake and the GitHub adapter
// (over a scripted GitHub API) both run it in `pnpm test`. Not part of the build.

import { describe, expect, it } from 'vitest';

import type { PullRequestPort } from '../domain/vcs/pull-request-port.js';
import { InvalidBranchNameError } from '../domain/vcs/vcs-errors.js';
import type { VcsWorkspace } from '../domain/vcs/vcs-port.js';

export interface PullRequestContractHarness {
  readonly create: () => { readonly port: PullRequestPort; readonly workspace: VcsWorkspace };
}

const BRANCH = 'janus/variant-01JC0F2NB7E0000000000000AA';

export function describePullRequestContract(
  name: string,
  harness: PullRequestContractHarness,
): void {
  describe(`${name} (PullRequestPort contract)`, () => {
    const input = (workspace: VcsWorkspace, branch = BRANCH) => ({
      owner: 'oblivionwing26',
      repo: 'janus-shoplab',
      branch,
      workspace,
      title: 'Janus: variant B',
      body: '# Janus dual report',
    });

    it('pushes a Janus branch and opens a pull request into the default branch', async () => {
      const { port, workspace } = harness.create();

      const opened = await port.open(input(workspace));

      expect(opened).toMatchObject({ base: 'main', existed: false });
      expect(opened.number).toBeGreaterThan(0);
      expect(opened.url).toMatch(/\/pull\/\d+$/);
    });

    it('returns the pull request already open for the branch instead of a second one', async () => {
      const { port, workspace } = harness.create();
      const first = await port.open(input(workspace));

      const again = await port.open(input(workspace));

      expect(again).toEqual({ ...first, existed: true });
    });

    it('refuses any branch but janus/variant-<runId> and janus/fix-<findingId>', async () => {
      const { port, workspace } = harness.create();

      await expect(port.open(input(workspace, 'main'))).rejects.toBeInstanceOf(
        InvalidBranchNameError,
      );
    });

    it('has no way to merge or approve a pull request (CLAUDE.md)', () => {
      const { port } = harness.create();
      const names = new Set<string>();
      for (
        let object: object | null = port;
        object !== null;
        object = Object.getPrototypeOf(object) as object | null
      ) {
        for (const key of Object.getOwnPropertyNames(object)) names.add(key);
      }

      expect([...names].filter((key) => /merge|approve|review/i.test(key))).toEqual([]);
    });
  });
}
