import type { BenchmarkChallenge } from '../../domain/benchmark/benchmark-challenge.js';
import type {
  BenchmarkRoundPort,
  BenchmarkRoundResult,
} from '../../domain/benchmark/benchmark-round-port.js';
import type { BenchmarkSpec } from '../../domain/benchmark/benchmark-spec.js';
import { InvalidBenchmarkError } from '../../domain/benchmark/invalid-benchmark-error.js';
import { scoreBenchmark, type BenchmarkScore } from '../../domain/benchmark/score-benchmark.js';

export interface RunBenchmarkResult {
  readonly control: BenchmarkRoundResult;
  readonly rounds: readonly BenchmarkRoundResult[];
  readonly score: BenchmarkScore;
  /** What the control solved before any attack. */
  readonly controlSolved: readonly string[];
}

/**
 * The public benchmark (F3.11): a control round, then `runs` attack rounds, each on a fresh
 * instance of the target, scored by `scoreBenchmark`. Rounds run one after the other so they
 * never compete for the target's rate limit or for Docker.
 */
export class RunBenchmark {
  constructor(private readonly deps: { readonly rounds: BenchmarkRoundPort }) {}

  async execute(input: {
    readonly spec: BenchmarkSpec;
    readonly runs: number;
    readonly onProgress?: (message: string) => void;
  }): Promise<RunBenchmarkResult> {
    if (!Number.isInteger(input.runs) || input.runs < 1 || input.runs > 10) {
      throw new InvalidBenchmarkError('runs must be a whole number from 1 to 10');
    }
    const say = input.onProgress ?? (() => undefined);
    say('control round: the target is up, nobody attacks it');
    const control = await this.deps.rounds.control();
    const controlSolved = solvedKeys(control.challenges);

    const rounds: BenchmarkRoundResult[] = [];
    for (let index = 1; index <= input.runs; index++) {
      say(`attack round ${String(index)} of ${String(input.runs)}`);
      rounds.push(await this.deps.rounds.attack());
    }
    return {
      control,
      rounds,
      controlSolved,
      score: scoreBenchmark(
        input.spec,
        controlSolved,
        rounds.map((round) => round.challenges),
      ),
    };
  }
}

function solvedKeys(challenges: readonly BenchmarkChallenge[]): string[] {
  return challenges.filter((each) => each.solved).map((each) => each.key);
}
