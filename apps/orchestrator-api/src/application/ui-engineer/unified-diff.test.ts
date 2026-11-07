import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { unifiedDiff } from './unified-diff.js';

const lines = (count: number, prefix = 'line') =>
  `${Array.from({ length: count }, (_, i) => `${prefix} ${String(i + 1)}`).join('\n')}\n`;

/** Applies the diff with git itself in a scratch repository and returns the file afterwards. */
async function gitApply(path: string, before: string | null, diff: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'janus-diff-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, windowsHide: true });
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  await mkdir(dirname(join(dir, path)), { recursive: true });
  if (before !== null) await writeFile(join(dir, path), before);
  await writeFile(join(dir, 'patch.diff'), diff);
  git('apply', '--whitespace=nowarn', 'patch.diff');
  try {
    return await readFile(join(dir, path), 'utf8');
  } catch {
    return null;
  }
}

describe('unifiedDiff', () => {
  const cases: [string, string | null, string | null][] = [
    ['one line in the middle', lines(20), lines(20).replace('line 10\n', 'line ten\n')],
    [
      'two distant changes, two hunks',
      lines(40),
      lines(40).replace('line 3\n', 'line three\n').replace('line 35\n', 'line 35\nnew line\n'),
    ],
    ['lines added at the start and the end', lines(5), `first\n${lines(5)}last\n`],
    ['lines removed', lines(12), lines(12).replace('line 4\nline 5\n', '')],
    ['a new file', null, 'export const Coupon = () => null;\n'],
    ['a deleted file', lines(3), null],
    ['a file emptied of all but one line', lines(6), 'only\n'],
  ];

  for (const [name, before, after] of cases) {
    it(`writes a patch git applies exactly: ${name}`, async () => {
      const diff = unifiedDiff('src/page.tsx', before, after);

      expect(await gitApply('src/page.tsx', before, diff)).toBe(after);
    });
  }

  it('is empty when nothing changed and counts lines like git', () => {
    expect(unifiedDiff('a.ts', 'x\n', 'x\n')).toBe('');
    const diff = unifiedDiff('a.ts', lines(20), lines(20).replace('line 10\n', 'line ten\n'));
    expect(diff).toContain('@@ -7,7 +7,7 @@');
    expect(diff.split('\n').filter((line) => /^[-+][^-+]/.test(line))).toEqual([
      '-line 10',
      '+line ten',
    ]);
  });
});
