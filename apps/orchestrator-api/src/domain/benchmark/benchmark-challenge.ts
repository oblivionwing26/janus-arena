/** One challenge of the benchmark target, as the target itself reports it after a round (F3.11). */
export interface BenchmarkChallenge {
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly difficulty: number;
  readonly solved: boolean;
}
