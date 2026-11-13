import type { BenchmarkChallenge } from './benchmark-challenge.js';
import type { BenchmarkSpec } from './benchmark-spec.js';
import { InvalidBenchmarkError } from './invalid-benchmark-error.js';

/** A challenge inside the benchmark's scope, and how often the Red Team solved it. */
export interface ScoredChallenge {
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly difficulty: number;
  /** The Red Team classes that act in this challenge's category. */
  readonly classes: readonly string[];
  readonly reference: boolean;
  /** In how many rounds the target marked it solved and the control had not. */
  readonly solvedRounds: number;
  /** The control already had it solved: it is Janus's in no round. */
  readonly incidental: boolean;
  /** Why a Janus request solved it without the engine meaning to, when the spec says so. */
  readonly sideEffect: string | null;
}

export interface RoundScore {
  /** Challenges in scope solved in this round. */
  readonly solved: number;
  /** Of those, the ones the spec does not list as a side effect. */
  readonly solvedOnPurpose: number;
  readonly referenceSolved: number;
  readonly referenceTotal: number;
}

export interface CategoryScore {
  readonly category: string;
  readonly classes: readonly string[];
  readonly total: number;
  readonly solvedAny: number;
  readonly solvedAll: number;
}

export interface BenchmarkScore {
  /** The denominator: every challenge of the categories in scope. */
  readonly inScope: number;
  readonly rounds: readonly RoundScore[];
  readonly categories: readonly CategoryScore[];
  readonly challenges: readonly ScoredChallenge[];
  /** The reference challenges, whatever their category. */
  readonly reference: readonly {
    readonly key: string;
    readonly name: string;
    readonly solvedRounds: number;
  }[];
  /** Solved in some round, but in no category in scope: reported, never counted. */
  readonly outside: readonly {
    readonly key: string;
    readonly name: string;
    readonly category: string;
    readonly solvedRounds: number;
  }[];
  /** Already solved by the control, anywhere: not counted. */
  readonly incidental: readonly {
    readonly key: string;
    readonly name: string;
    readonly category: string;
  }[];
}

/**
 * The benchmark's recall (F3.11), from what the target itself marks solved after each round on a
 * fresh instance. The denominator is every challenge in the categories of the spec, solved or
 * not, so an attack the engine cannot make still counts against it. A challenge the control had
 * already solved is not counted for anyone. A challenge solved outside the categories is only
 * listed. Pure: no I/O, no LLM.
 */
export function scoreBenchmark(
  spec: BenchmarkSpec,
  control: Iterable<string>,
  rounds: readonly (readonly BenchmarkChallenge[])[],
): BenchmarkScore {
  const [first] = rounds;
  if (first === undefined) throw new InvalidBenchmarkError('it needs at least one round');
  const preSolved = new Set(control);
  const universe = first;
  const solvedIn = rounds.map(
    (round) => new Set(round.filter((each) => each.solved).map((each) => each.key)),
  );
  const roundsSolved = (key: string) =>
    solvedIn.filter((solved) => solved.has(key) && !preSolved.has(key)).length;

  for (const category of Object.keys(spec.categories)) {
    if (!universe.some((each) => each.category === category)) {
      throw new InvalidBenchmarkError(`${spec.target} has no challenge in category "${category}"`);
    }
  }
  const reference = new Set(spec.reference);
  const inScope = universe.filter((each) => each.category in spec.categories);

  const challenges = inScope.map((each): ScoredChallenge => ({
    key: each.key,
    name: each.name,
    category: each.category,
    difficulty: each.difficulty,
    classes: spec.categories[each.category] ?? [],
    reference: reference.has(each.key),
    solvedRounds: roundsSolved(each.key),
    incidental: preSolved.has(each.key),
    sideEffect: spec.sideEffects[each.key] ?? null,
  }));
  const referenceChallenges = spec.reference.flatMap((key) => {
    const found = universe.find((each) => each.key === key);
    return found === undefined ? [] : [{ key, name: found.name, solvedRounds: roundsSolved(key) }];
  });

  return {
    inScope: inScope.length,
    rounds: solvedIn.map((solved): RoundScore => ({
      solved: inScope.filter((each) => solved.has(each.key) && !preSolved.has(each.key)).length,
      solvedOnPurpose: inScope.filter(
        (each) =>
          solved.has(each.key) && !preSolved.has(each.key) && !(each.key in spec.sideEffects),
      ).length,
      referenceSolved: referenceChallenges.filter(
        (each) => solved.has(each.key) && !preSolved.has(each.key),
      ).length,
      referenceTotal: referenceChallenges.length,
    })),
    categories: Object.entries(spec.categories).map(([category, classes]): CategoryScore => {
      const inCategory = challenges.filter((each) => each.category === category);
      return {
        category,
        classes,
        total: inCategory.length,
        solvedAny: inCategory.filter((each) => each.solvedRounds > 0).length,
        solvedAll: inCategory.filter((each) => each.solvedRounds === rounds.length).length,
      };
    }),
    challenges,
    reference: referenceChallenges,
    outside: universe
      .filter((each) => !(each.category in spec.categories) && roundsSolved(each.key) > 0)
      .map((each) => ({
        key: each.key,
        name: each.name,
        category: each.category,
        solvedRounds: roundsSolved(each.key),
      })),
    incidental: universe
      .filter((each) => preSolved.has(each.key))
      .map((each) => ({ key: each.key, name: each.name, category: each.category })),
  };
}
