export type AbVerdict = 'no-detectable-difference' | 'b-higher' | 'b-lower';

/**
 * The exit rule (F1.8): an interval of B − A that contains 0 means "no detectable difference".
 * Reports never turn this into a conversion claim (CLAUDE.md): it is synthetic task success.
 */
export function decide(interval: { readonly low: number; readonly high: number }): AbVerdict {
  if (interval.low <= 0 && interval.high >= 0) return 'no-detectable-difference';
  return interval.low > 0 ? 'b-higher' : 'b-lower';
}
