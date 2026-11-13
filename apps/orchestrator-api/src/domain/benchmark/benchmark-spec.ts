/** What counts in a target's benchmark (F3.11), from config/benchmarks.yaml. */
export interface BenchmarkSpec {
  readonly target: string;
  /** The denominator: each category in which a Red Team class acts, and the classes that act. */
  readonly categories: Readonly<Record<string, readonly string[]>>;
  /** The challenges the engine was built around, reported apart. */
  readonly reference: readonly string[];
  /**
   * Challenges a Janus request solved without the engine meaning to attack them, each with why.
   * They stay counted, because a Janus request did solve them, and are reported both ways.
   */
  readonly sideEffects: Readonly<Record<string, string>>;
}
