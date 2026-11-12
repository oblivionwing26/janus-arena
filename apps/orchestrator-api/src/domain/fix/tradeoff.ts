import type { UxMeasurement } from './fix-verifier.js';

/** One alternative fix and what the verifiers measured on it (F3.6). */
export interface TradeoffRow {
  /** How the report names it: "free fix", "account lockout"... */
  readonly label: string;
  /** The strategy the Blue Team was asked for; null for its own free fix. */
  readonly strategy: string | null;
  /** Null when no fix that builds came out of it. */
  readonly patchId: string | null;
  /** V1's verdict: false when the PoC no longer works; null when not measured. */
  readonly exploitable: boolean | null;
  /** V3's measurement; null when not measured. */
  readonly ux: UxMeasurement | null;
  readonly uxPassed: boolean | null;
  /** Why it was rejected, or what the verifiers said. */
  readonly note: string;
}

const rate = (count: { readonly successes: number; readonly n: number } | null) =>
  count === null || count.n === 0 ? -1 : count.successes / count.n;
const ratio = (count: { readonly successes: number; readonly n: number } | null) =>
  count === null ? '—' : `${String(count.successes)}/${String(count.n)}`;
const p95 = (row: TradeoffRow) => row.ux?.latency[0]?.b ?? Number.POSITIVE_INFINITY;

/**
 * The recommendation of a trade-off report (F3.6), by code: of the alternatives that close the
 * attack (V1) and that V3 measured, the one that keeps the most shoppers succeeding on the fix;
 * on a tie, the one with the lower p95 on the first endpoint the fix touched. Null when none
 * closes the attack: security first, then the UX it costs.
 */
export function recommend(rows: readonly TradeoffRow[]): {
  readonly row: TradeoffRow | null;
  readonly reason: string;
} {
  const safe = rows.filter((each) => each.exploitable === false && each.ux !== null);
  const ranked = [...safe].sort(
    (x, y) => rate(y.ux?.b ?? null) - rate(x.ux?.b ?? null) || p95(x) - p95(y),
  );
  const chosen = ranked[0];
  if (chosen === undefined) {
    const anySafe = rows.some((each) => each.exploitable === false);
    return {
      row: null,
      reason: anySafe
        ? 'no alternative that closed the attack was measured by V3'
        : 'no alternative closed the attack (V1)',
    };
  }
  const others = ranked
    .slice(1)
    .map((each) => `${each.label}: ${ratio(each.ux?.b ?? null)}`)
    .join(', ');
  return {
    row: chosen,
    reason:
      `${chosen.label} closes the attack and ${ratio(chosen.ux?.b ?? null)} shoppers succeed ` +
      `(${ratio(chosen.ux?.a ?? null)} on the original)` +
      (others === ''
        ? ''
        : `; the other safe alternatives keep fewer or answer slower (${others})`),
  };
}
