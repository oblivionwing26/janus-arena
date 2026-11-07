import { describe, expect, it } from 'vitest';

import { assertRepoUrl } from './assert-repo-url.js';
import { JanusBranch } from './janus-branch.js';
import { patchPaths } from './patch-paths.js';
import { InvalidBranchNameError, InvalidRepoUrlError, PatchRejectedError } from './vcs-errors.js';

const RUN = '01JC0F21VCS0000000000000AA';

describe('JanusBranch', () => {
  it('names variant and fix branches after a ULID', () => {
    expect(JanusBranch.variant(RUN)).toBe(`janus/variant-${RUN}`);
    expect(JanusBranch.fix(RUN)).toBe(`janus/fix-${RUN}`);
  });

  it('refuses any other branch', () => {
    for (const name of [
      'main',
      'janus/variant-1',
      `janus/variant-${RUN}/x`,
      `-b janus/fix-${RUN}`,
    ]) {
      expect(() => JanusBranch.assert(name)).toThrow(InvalidBranchNameError);
    }
  });
});

describe('assertRepoUrl', () => {
  it('accepts https and file URLs only', () => {
    expect(assertRepoUrl('https://github.com/x/y.git')).toBe('https://github.com/x/y.git');
    expect(assertRepoUrl('file:///C:/repos/y')).toBe('file:///C:/repos/y');
    for (const url of ['--upload-pack=x', 'ext::sh -c x', 'git@github.com:x/y.git', 'http://x/y']) {
      expect(() => assertRepoUrl(url)).toThrow(InvalidRepoUrlError);
    }
  });
});

describe('patchPaths', () => {
  it('lists the files a diff touches, new and deleted ones included', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-x',
      '+y',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1 @@',
      '+z',
    ].join('\n');

    expect(patchPaths(diff)).toEqual(['src/a.ts', 'src/new.ts']);
  });

  it('rejects paths outside the repository and text that is not a diff', () => {
    for (const path of ['../evil.ts', '/etc/passwd', '.git/config', 'src/../../x', 'C:/x']) {
      expect(() => patchPaths(`--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`)).toThrow(
        PatchRejectedError,
      );
    }
    expect(() => patchPaths('just text')).toThrow(PatchRejectedError);
  });
});
