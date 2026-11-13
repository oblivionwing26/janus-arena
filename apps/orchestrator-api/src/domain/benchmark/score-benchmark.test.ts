import { describe, expect, it } from 'vitest';

import type { BenchmarkChallenge } from './benchmark-challenge.js';
import type { BenchmarkSpec } from './benchmark-spec.js';
import { InvalidBenchmarkError } from './invalid-benchmark-error.js';
import { scoreBenchmark } from './score-benchmark.js';

const SPEC: BenchmarkSpec = {
  target: 'juice-shop',
  categories: {
    'Broken Access Control': ['idor'],
    XSS: ['xss'],
    'Broken Anti Automation': ['business-logic', 'brute-force'],
  },
  reference: ['basketAccessChallenge', 'localXssChallenge', 'notInThisVersionChallenge'],
  sideEffects: { forgedReviewChallenge: 'A probe of the reviews lands on it by accident.' },
};

const CATALOGUE = [
  {
    key: 'basketAccessChallenge',
    name: 'View Basket',
    category: 'Broken Access Control',
    difficulty: 2,
  },
  {
    key: 'forgedReviewChallenge',
    name: 'Forged Review',
    category: 'Broken Access Control',
    difficulty: 3,
  },
  { key: 'localXssChallenge', name: 'DOM XSS', category: 'XSS', difficulty: 1 },
  { key: 'videoXssChallenge', name: 'Video XSS', category: 'XSS', difficulty: 6 },
  {
    key: 'timingAttackChallenge',
    name: 'Multiple Likes',
    category: 'Broken Anti Automation',
    difficulty: 4,
  },
  { key: 'scoreBoardChallenge', name: 'Score Board', category: 'Miscellaneous', difficulty: 1 },
  {
    key: 'privacyPolicyChallenge',
    name: 'Privacy Policy',
    category: 'Miscellaneous',
    difficulty: 1,
  },
] as const;

/** A round as the target reports it: these keys are solved, the rest of the catalogue is not. */
const round = (...solved: string[]): BenchmarkChallenge[] =>
  CATALOGUE.map((challenge) => ({ ...challenge, solved: solved.includes(challenge.key) }));

describe('scoreBenchmark (F3.11)', () => {
  it('counts what Juice Shop marks solved among the challenges of the categories in scope', () => {
    const score = scoreBenchmark(SPEC, [], [round('basketAccessChallenge', 'localXssChallenge')]);

    expect(score.inScope).toBe(5);
    expect(score.rounds).toEqual([
      expect.objectContaining({ solved: 2, referenceSolved: 2, referenceTotal: 2 }),
    ]);
    expect(
      score.categories.map(({ category, total, solvedAny }) => [category, total, solvedAny]),
    ).toEqual([
      ['Broken Access Control', 2, 1],
      ['XSS', 2, 1],
      ['Broken Anti Automation', 1, 0],
    ]);
  });

  it('keeps unsolved challenges of the scope in the denominator, with the classes that act on them', () => {
    const score = scoreBenchmark(SPEC, [], [round()]);

    const forged = score.challenges.find((each) => each.key === 'forgedReviewChallenge');
    expect(forged).toMatchObject({ solvedRounds: 0, classes: ['idor'] });
    expect(score.rounds[0]?.solved).toBe(0);
    expect(score.challenges.find((each) => each.key === 'timingAttackChallenge')?.classes).toEqual([
      'business-logic',
      'brute-force',
    ]);
  });

  it('does not count what the control already solved, and lists it apart', () => {
    const score = scoreBenchmark(
      SPEC,
      ['scoreBoardChallenge', 'localXssChallenge'],
      [round('basketAccessChallenge', 'localXssChallenge', 'scoreBoardChallenge')],
    );

    expect(score.rounds[0]?.solved).toBe(1);
    expect(score.challenges.find((each) => each.key === 'localXssChallenge')).toMatchObject({
      solvedRounds: 0,
      incidental: true,
    });
    expect(score.incidental.map((each) => each.key).sort()).toEqual([
      'localXssChallenge',
      'scoreBoardChallenge',
    ]);
  });

  it('reports a challenge solved outside the categories apart, never in the recall', () => {
    const score = scoreBenchmark(SPEC, [], [round('privacyPolicyChallenge')]);

    expect(score.rounds[0]?.solved).toBe(0);
    expect(score.outside).toEqual([
      expect.objectContaining({ key: 'privacyPolicyChallenge', solvedRounds: 1 }),
    ]);
    expect(score.challenges.map((each) => each.key)).not.toContain('privacyPolicyChallenge');
  });

  it('says in how many rounds each challenge was solved, and which ones were solved in all', () => {
    const score = scoreBenchmark(
      SPEC,
      [],
      [
        round('basketAccessChallenge', 'localXssChallenge'),
        round('basketAccessChallenge'),
        round('basketAccessChallenge', 'timingAttackChallenge'),
      ],
    );

    const rounds = (key: string) => score.challenges.find((each) => each.key === key)?.solvedRounds;
    expect(rounds('basketAccessChallenge')).toBe(3);
    expect(rounds('localXssChallenge')).toBe(1);
    expect(rounds('timingAttackChallenge')).toBe(1);
    expect(rounds('forgedReviewChallenge')).toBe(0);
    expect(score.rounds.map((each) => each.solved)).toEqual([2, 1, 2]);
    expect(score.categories[0]).toMatchObject({ solvedAny: 1, solvedAll: 1 });
    expect(score.categories[1]).toMatchObject({ solvedAny: 1, solvedAll: 0 });
  });

  it('reports the reference challenges apart, ignoring one this version of the target lacks', () => {
    const score = scoreBenchmark(SPEC, [], [round('basketAccessChallenge')]);

    expect(score.reference.map((each) => each.key)).toEqual([
      'basketAccessChallenge',
      'localXssChallenge',
    ]);
    expect(score.rounds[0]).toMatchObject({ referenceSolved: 1, referenceTotal: 2 });
  });

  it('counts a side effect, and says how many were solved on purpose', () => {
    const score = scoreBenchmark(
      SPEC,
      [],
      [round('basketAccessChallenge', 'forgedReviewChallenge')],
    );

    expect(score.rounds[0]).toMatchObject({ solved: 2, solvedOnPurpose: 1 });
    expect(score.challenges.find((each) => each.key === 'forgedReviewChallenge')?.sideEffect).toBe(
      'A probe of the reviews lands on it by accident.',
    );
    expect(
      score.challenges.find((each) => each.key === 'basketAccessChallenge')?.sideEffect,
    ).toBeNull();
  });

  it('refuses a benchmark with no round or with a category that holds no challenge', () => {
    expect(() => scoreBenchmark(SPEC, [], [])).toThrow(InvalidBenchmarkError);
    expect(() =>
      scoreBenchmark({ ...SPEC, categories: { Nonexistent: ['xss'] } }, [], [round()]),
    ).toThrow(InvalidBenchmarkError);
  });
});
