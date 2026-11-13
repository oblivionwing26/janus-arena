import type { BenchmarkChallenge } from './benchmark-challenge.js';

/** What one round of the benchmark saw. */
export interface BenchmarkRoundResult {
  /** The challenges of a fresh target instance after the round, solved or not. */
  readonly challenges: readonly BenchmarkChallenge[];
  /** The run that recorded the round: its events, and the Red Team's attacks in an attack round. */
  readonly runId: string;
  /** The classes of the findings the Red Team confirmed in the round. */
  readonly findings: readonly string[];
  readonly durationMs: number;
  readonly costEur: number;
}

/**
 * One round of the benchmark on a fresh instance of the target (F3.11): the control does
 * everything but attack, so whatever it solves is not Janus's; `attack` runs the Red Team with
 * every class. Each call starts its own instance and tears it down, so rounds share nothing.
 */
export interface BenchmarkRoundPort {
  control(): Promise<BenchmarkRoundResult>;
  attack(): Promise<BenchmarkRoundResult>;
}
