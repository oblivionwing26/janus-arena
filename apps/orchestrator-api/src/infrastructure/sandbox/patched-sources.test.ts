import { describe, expect, it } from 'vitest';

import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { patchedSources } from './patched-sources.js';

const policy = new EditPolicy({
  allow: ['routes/**/*.ts', 'lib/**/*.ts'],
  deny: ['lib/startup/**'],
});
/** `git diff --name-status -z` output. */
const status = (...entries: [string, string][]) =>
  entries.map(([kind, path]) => `${kind}\0${path}\0`).join('');

describe('patchedSources (ADR 0012)', () => {
  it('lists the added and modified sources the patch changed, sorted', () => {
    expect(
      patchedSources(status(['M', 'routes/basket.ts'], ['A', 'lib/owner-check.ts']), policy),
    ).toEqual(['lib/owner-check.ts', 'routes/basket.ts']);
  });

  it('is empty when nothing changed: the variant is the published image', () => {
    expect(patchedSources('', policy)).toEqual([]);
  });

  it.each([
    ['a deleted source, whose compiled file would stay in the image', ['D', 'routes/basket.ts']],
    ['a file that is not TypeScript', ['M', 'routes/basket.js']],
    ['a path outside the Blue Team policy', ['M', 'frontend/src/main.ts']],
    ['a denied path', ['M', 'lib/startup/validateConfig.ts']],
    ['a path a shell would split', ['M', 'routes/a b.ts']],
  ] as [string, [string, string]][])('refuses %s', (_label, entry) => {
    expect(() => patchedSources(status(entry), policy)).toThrow(/cannot be built/);
  });
});
