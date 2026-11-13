import { describe, expect, it } from 'vitest';

import type { RunBenchmarkResult } from '../../application/benchmark/run-benchmark.js';
import type { BenchmarkChallenge } from '../../domain/benchmark/benchmark-challenge.js';
import type { BenchmarkSpec } from '../../domain/benchmark/benchmark-spec.js';
import { scoreBenchmark } from '../../domain/benchmark/score-benchmark.js';
import { benchmarkJson, formatBenchmark } from './format-benchmark.js';

const SPEC: BenchmarkSpec = {
  target: 'juice-shop',
  categories: { XSS: ['xss'], 'Broken Access Control': ['idor'] },
  reference: ['localXssChallenge'],
  sideEffects: { videoXssChallenge: 'A probe of the search box lands on it by accident.' },
};
const META = {
  command: 'pnpm run:benchmark juice-shop --runs 2',
  target: 'juice-shop',
  image: 'bkimminich/juice-shop:v20.3.0@sha256:abc',
  janusCommit: 'a'.repeat(40),
  generatedAt: '2026-11-13T12:00:00.000Z',
};

const challenges = (...solved: string[]): BenchmarkChallenge[] =>
  [
    { key: 'localXssChallenge', name: 'DOM XSS', category: 'XSS', difficulty: 1 },
    { key: 'videoXssChallenge', name: 'Video XSS', category: 'XSS', difficulty: 6 },
    {
      key: 'basketAccessChallenge',
      name: 'View Basket',
      category: 'Broken Access Control',
      difficulty: 2,
    },
    { key: 'scoreBoardChallenge', name: 'Score Board', category: 'Miscellaneous', difficulty: 1 },
    {
      key: 'privacyPolicyChallenge',
      name: 'Privacy | Policy',
      category: 'Miscellaneous',
      difficulty: 1,
    },
  ].map((each) => ({ ...each, solved: solved.includes(each.key) }));

function outcome(): RunBenchmarkResult {
  const control = {
    challenges: challenges('scoreBoardChallenge'),
    runId: '01JC0F340CTRL000000000000A',
    findings: [],
    durationMs: 20_000,
    costEur: 0,
  };
  const rounds = [
    {
      challenges: challenges('scoreBoardChallenge', 'localXssChallenge', 'basketAccessChallenge'),
      runId: '01JC0F340R0UND00000000000A',
      findings: ['xss', 'idor'],
      durationMs: 75_000,
      costEur: 0,
    },
    {
      challenges: challenges(
        'scoreBoardChallenge',
        'basketAccessChallenge',
        'privacyPolicyChallenge',
      ),
      runId: '01JC0F340R0UND00000000000B',
      findings: ['idor'],
      durationMs: 61_000,
      costEur: 0,
    },
  ];
  const controlSolved = ['scoreBoardChallenge'];
  return {
    control,
    rounds,
    controlSolved,
    score: scoreBenchmark(
      SPEC,
      controlSolved,
      rounds.map((round) => round.challenges),
    ),
  };
}

describe('formatBenchmark (F3.11)', () => {
  const markdown = formatBenchmark(META, SPEC, outcome());

  it('starts with the exact command that reproduces it, the image and the commit', () => {
    expect(markdown).toContain('```bash\npnpm run:benchmark juice-shop --runs 2\n```');
    expect(markdown).toContain('`bkimminich/juice-shop:v20.3.0@sha256:abc`');
    expect(markdown).toContain('a'.repeat(40));
  });

  it('gives each round’s recall with its Wilson interval, its time and its run', () => {
    expect(markdown).toContain(
      '| 1 | 2/3 = 66.7 % | [20.8 %, 93.9 %] | 2/3 = 66.7 % | 1/1 | 2 | 1 min 15 s | 0.00 € |',
    );
    expect(markdown).toContain(
      '| 2 | 1/3 = 33.3 % | [6.1 %, 79.2 %] | 1/3 = 33.3 % | 0/1 | 1 | 1 min 1 s | 0.00 € |',
    );
    expect(markdown).toContain('`01JC0F340R0UND00000000000A`');
    expect(markdown).toContain(
      'Solved in **every** round: 1 of 3. Solved in **at least one**: 2 of 3.',
    );
  });

  it('breaks the result down by category and by challenge, with the classes that act', () => {
    expect(markdown).toContain('| XSS | xss | 2 | 0 | 1 | 50.0 % |');
    expect(markdown).toContain('| Broken Access Control | idor | 1 | 1 | 1 | 100.0 % |');
    expect(markdown).toContain('| Video XSS | XSS | ★★★★★★ | xss | 0/2 |');
    expect(markdown).toContain('| DOM XSS (`localXssChallenge`) | 1/2 |');
  });

  it('says what it left out: the control’s solves, the ones outside the categories, the optional tools', () => {
    expect(markdown).toContain(
      '**Solved by the control** (the target was up and nobody attacked it): Score Board (Miscellaneous).',
    );
    expect(markdown).toContain('(reported, never counted): Privacy | Policy (Miscellaneous, 1/2)');
    expect(markdown).toContain('Not run: Nuclei, ZAP baseline and the Argus subset');
  });

  it('lists a solved side effect with its reason and gives the recall without it', () => {
    const spec = {
      ...SPEC,
      sideEffects: { basketAccessChallenge: 'A probe of the baskets lands on it.' },
    };
    const base = outcome();
    const text = formatBenchmark(META, spec, {
      ...base,
      score: scoreBenchmark(
        spec,
        base.controlSolved,
        base.rounds.map((round) => round.challenges),
      ),
    });

    expect(text).toContain('## Side effects');
    expect(text).toContain('- **View Basket** (2 rounds): A probe of the baskets lands on it.');
    expect(text).toContain('| 1 | 2/3 = 66.7 % | [20.8 %, 93.9 %] | 1/3 = 33.3 % |');
    expect(text).toContain('View Basket (side effect, see below)');
  });

  it('leaves the same rounds as data, with their intervals', () => {
    const json = benchmarkJson(META, SPEC, outcome());

    expect(json).toMatchObject({
      inScope: 3,
      control: { solved: ['scoreBoardChallenge'] },
      rounds: [
        { solved: 2, referenceSolved: 1, interval: { successes: 2, n: 3 } },
        { solved: 1, referenceSolved: 0, interval: { successes: 1, n: 3 } },
      ],
    });
  });
});
