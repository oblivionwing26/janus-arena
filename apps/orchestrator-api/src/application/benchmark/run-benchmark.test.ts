import { describe, expect, it } from 'vitest';

import type {
  BenchmarkRoundPort,
  BenchmarkRoundResult,
} from '../../domain/benchmark/benchmark-round-port.js';
import type { BenchmarkSpec } from '../../domain/benchmark/benchmark-spec.js';
import { InvalidBenchmarkError } from '../../domain/benchmark/invalid-benchmark-error.js';
import { RunBenchmark } from './run-benchmark.js';

const SPEC: BenchmarkSpec = {
  target: 'juice-shop',
  categories: { XSS: ['xss'], 'Broken Access Control': ['idor'] },
  reference: ['localXssChallenge'],
  sideEffects: {},
};

const result = (solved: string[]): BenchmarkRoundResult => ({
  challenges: [
    {
      key: 'localXssChallenge',
      name: 'DOM XSS',
      category: 'XSS',
      difficulty: 1,
      solved: solved.includes('localXssChallenge'),
    },
    {
      key: 'basketAccessChallenge',
      name: 'View Basket',
      category: 'Broken Access Control',
      difficulty: 2,
      solved: solved.includes('basketAccessChallenge'),
    },
    {
      key: 'scoreBoardChallenge',
      name: 'Score Board',
      category: 'Miscellaneous',
      difficulty: 1,
      solved: solved.includes('scoreBoardChallenge'),
    },
  ],
  runId: '01JC0F330BNCH000000000000A',
  findings: [],
  durationMs: 1000,
  costEur: 0,
});

/** A target whose rounds are scripted, one after the other, recording the order they ran in. */
class ScriptedRounds implements BenchmarkRoundPort {
  readonly calls: string[] = [];

  constructor(
    private readonly first: BenchmarkRoundResult,
    private readonly attacks: BenchmarkRoundResult[],
  ) {}

  control(): Promise<BenchmarkRoundResult> {
    this.calls.push('control');
    return Promise.resolve(this.first);
  }

  attack(): Promise<BenchmarkRoundResult> {
    this.calls.push('attack');
    const next = this.attacks.shift();
    if (next === undefined) return Promise.reject(new Error('no more scripted rounds'));
    return Promise.resolve(next);
  }
}

describe('RunBenchmark (F3.11)', () => {
  it('runs the control first, then every attack round, and scores them together', async () => {
    const rounds = new ScriptedRounds(result([]), [
      result(['localXssChallenge', 'basketAccessChallenge']),
      result(['basketAccessChallenge']),
      result(['basketAccessChallenge']),
    ]);

    const outcome = await new RunBenchmark({ rounds }).execute({ spec: SPEC, runs: 3 });

    expect(rounds.calls).toEqual(['control', 'attack', 'attack', 'attack']);
    expect(outcome.score.rounds.map((round) => round.solved)).toEqual([2, 1, 1]);
    expect(outcome.score.challenges.map((each) => [each.key, each.solvedRounds])).toEqual([
      ['localXssChallenge', 1],
      ['basketAccessChallenge', 3],
    ]);
    expect(outcome.rounds).toHaveLength(3);
  });

  it('does not count what the control solved without any attack', async () => {
    const rounds = new ScriptedRounds(result(['localXssChallenge', 'scoreBoardChallenge']), [
      result(['localXssChallenge', 'scoreBoardChallenge']),
    ]);

    const outcome = await new RunBenchmark({ rounds }).execute({ spec: SPEC, runs: 1 });

    expect(outcome.controlSolved).toEqual(['localXssChallenge', 'scoreBoardChallenge']);
    expect(outcome.score.rounds[0]?.solved).toBe(0);
    expect(outcome.score.incidental.map((each) => each.key)).toEqual([
      'localXssChallenge',
      'scoreBoardChallenge',
    ]);
  });

  it('says what it is doing, and refuses a number of runs that makes no sense', async () => {
    const said: string[] = [];

    await new RunBenchmark({ rounds: new ScriptedRounds(result([]), [result([])]) }).execute({
      spec: SPEC,
      runs: 1,
      onProgress: (message) => said.push(message),
    });

    expect(said).toEqual([
      'control round: the target is up, nobody attacks it',
      'attack round 1 of 1',
    ]);
    for (const runs of [0, 11, 1.5]) {
      await expect(
        new RunBenchmark({ rounds: new ScriptedRounds(result([]), []) }).execute({
          spec: SPEC,
          runs,
        }),
      ).rejects.toBeInstanceOf(InvalidBenchmarkError);
    }
  });

  it('stops when a round fails, without a score built from the rounds that did run', async () => {
    const rounds = new ScriptedRounds(result([]), [result(['basketAccessChallenge'])]);

    await expect(new RunBenchmark({ rounds }).execute({ spec: SPEC, runs: 2 })).rejects.toThrow(
      'no more scripted rounds',
    );
  });
});
