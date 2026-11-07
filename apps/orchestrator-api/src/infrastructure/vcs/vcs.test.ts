import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CONTRACT_FILES, describeVcsContract } from '../../test-support/vcs-contract.js';
import { InMemoryVcs } from './in-memory-vcs.js';
import { LocalGitAdapter } from './local-git-adapter.js';

const FAKE_URL = 'file:///fixtures/shoplab';

/** A throwaway git repository with CONTRACT_FILES committed on `main`. */
async function fixtureRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'janus-vcs-origin-'));
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', ...args],
      { cwd: dir, windowsHide: true },
    );
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'core.autocrlf', 'false');
  for (const [path, content] of Object.entries(CONTRACT_FILES)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  git('add', '--all');
  git('commit', '--quiet', '--message', 'fixture');
  return pathToFileURL(dir).href;
}

describeVcsContract('InMemoryVcs', {
  create: () =>
    Promise.resolve({
      vcs: new InMemoryVcs({ [FAKE_URL]: { main: CONTRACT_FILES } }),
      repoUrl: FAKE_URL,
    }),
});

describeVcsContract('LocalGitAdapter', {
  create: async () => ({
    vcs: new LocalGitAdapter(await mkdtemp(join(tmpdir(), 'janus-vcs-workspaces-'))),
    repoUrl: await fixtureRepo(),
  }),
});
