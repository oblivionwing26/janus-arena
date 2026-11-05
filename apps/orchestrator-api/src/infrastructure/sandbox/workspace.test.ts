import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prepareWorkspace, removeWorkspace } from './workspace.js';

let base: string;
let repoUrl: string;

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'janus-workspace-'));
  const repo = join(base, 'origin');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  await writeFile(join(repo, 'app.txt'), 'app\n');
  await writeFile(join(repo, 'UX_FLAWS.md'), 'ground truth\n');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.email=t@janus.test', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  repoUrl = pathToFileURL(repo).href;
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('prepareWorkspace', () => {
  it('clones the ref and removes ground-truth files', async () => {
    const root = join(base, 'workspaces');

    const dir = await prepareWorkspace({
      root,
      variantId: 'a',
      repo: repoUrl,
      ref: 'main',
      excludeFiles: ['UX_FLAWS.md'],
    });

    expect(existsSync(join(dir, 'app.txt'))).toBe(true);
    expect(existsSync(join(dir, 'UX_FLAWS.md'))).toBe(false);

    await removeWorkspace(root, 'a');
    expect(existsSync(dir)).toBe(false);
  });

  it('replaces a stale workspace with a fresh clone', async () => {
    const root = join(base, 'workspaces');
    const first = await prepareWorkspace({
      root,
      variantId: 'b',
      repo: repoUrl,
      ref: 'main',
      excludeFiles: [],
    });
    await writeFile(join(first, 'stale.txt'), 'old\n');

    const second = await prepareWorkspace({
      root,
      variantId: 'b',
      repo: repoUrl,
      ref: 'main',
      excludeFiles: [],
    });

    expect(existsSync(join(second, 'stale.txt'))).toBe(false);
  });

  it('refuses refs that look like options', async () => {
    await expect(
      prepareWorkspace({
        root: join(base, 'workspaces'),
        variantId: 'c',
        repo: repoUrl,
        ref: '--upload-pack=touch /tmp/x',
        excludeFiles: [],
      }),
    ).rejects.toThrow(/must not start/);
  });
});
