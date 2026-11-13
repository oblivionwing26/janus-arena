export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

const RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export interface CandidateFinding {
  readonly findingId: string;
  readonly severity: FindingSeverity | undefined;
  /** False when V2 cannot generate a regression test from its PoC: no fix could ever pass. */
  readonly verifiable: boolean;
}

/**
 * Which confirmed findings the gate's Blue Team works on (F3.9): the most severe first, at most
 * `max`, and only those all three verifiers can judge. The others are named, not silently dropped.
 */
export function chooseFindings(
  candidates: readonly CandidateFinding[],
  max: number,
): { readonly chosen: readonly string[]; readonly unverifiable: readonly string[] } {
  const rank = (each: CandidateFinding) =>
    each.severity === undefined ? Object.keys(RANK).length : RANK[each.severity];
  return {
    chosen: candidates
      .filter((each) => each.verifiable)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, max)
      .map((each) => each.findingId),
    unverifiable: candidates.filter((each) => !each.verifiable).map((each) => each.findingId),
  };
}
