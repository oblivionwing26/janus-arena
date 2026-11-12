import { describe, expect, it } from 'vitest';

import { unthrottledGuessing, type GuessingRun } from './unthrottled-guessing.js';

const guesses = (count: number, status: number | null, ms: number) =>
  Array.from({ length: count }, () => ({ status, ms }));

describe('unthrottledGuessing (F3.6)', () => {
  it('is exploitable when every wrong guess is refused fast and the right one still signs in', () => {
    const run: GuessingRun = { guesses: guesses(20, 401, 30), rightAfter: { signedIn: true } };

    expect(unthrottledGuessing(run)).toEqual({
      exploitable: true,
      evidence:
        '20 wrong passwords were refused in 30 ms each on average, none throttled, and the right one still signed in',
    });
  });

  it('is not exploitable once the shop throttles a guess (429)', () => {
    const run: GuessingRun = {
      guesses: [...guesses(5, 401, 30), ...guesses(15, 429, 5)],
      rightAfter: { signedIn: false },
    };

    expect(unthrottledGuessing(run)).toMatchObject({ exploitable: false });
    expect(unthrottledGuessing(run).evidence).toContain('throttled at guess 6');
  });

  it('is not exploitable when the account locks: the right password no longer signs in', () => {
    const run: GuessingRun = { guesses: guesses(20, 401, 30), rightAfter: { signedIn: false } };

    expect(unthrottledGuessing(run)).toMatchObject({ exploitable: false });
    expect(unthrottledGuessing(run).evidence).toContain('the right password no longer signs in');
  });

  it('is not exploitable when the guesses are slowed down (a progressive delay)', () => {
    const run: GuessingRun = { guesses: guesses(20, 401, 1500), rightAfter: { signedIn: true } };

    expect(unthrottledGuessing(run)).toMatchObject({ exploitable: false });
    expect(unthrottledGuessing(run).evidence).toContain('1500 ms each on average');
  });

  // A typical false positive: a guess that never reached the shop is no proof of anything.
  it('judges nothing proven when a guess got no answer at all', () => {
    const run: GuessingRun = {
      guesses: [...guesses(19, 401, 30), { status: null, ms: 0 }],
      rightAfter: { signedIn: true },
    };

    expect(unthrottledGuessing(run)).toMatchObject({ exploitable: false });
  });
});
