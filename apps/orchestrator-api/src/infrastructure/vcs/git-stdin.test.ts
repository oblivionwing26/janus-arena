import { describe, expect, it } from 'vitest';

import { git } from './local-git-adapter.js';

describe('git helper and a git that does not read its input', () => {
  it('is not undone by the EPIPE or EOF of writing to a git that already exited (Linux CI)', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('uncaughtException', onUnhandled);
    try {
      // `git --version` exits at once and never reads stdin: a large input meets a closed pipe.
      const results = await Promise.all(
        Array.from({ length: 20 }, () => git(['--version'], { input: 'x'.repeat(2_000_000) })),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(results.every((out) => out.startsWith('git version'))).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('uncaughtException', onUnhandled);
    }
  });

  it('still reports a git that fails with its stderr', async () => {
    await expect(git(['definitely-not-a-command'])).rejects.toThrow(/definitely-not-a-command/);
  });
});
