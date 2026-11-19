// Every figure the launch page shows, with the report in this repository it comes from.
// launch-data.test.ts checks that each source exists and contains the evidence string.

export interface Sourced<T> {
  value: T;
  /** Repository path of the report the figure is taken from. */
  source: string;
  /** Text that must appear in the source, so a changed report fails the test. */
  evidence: string;
}

const JUICE_GATE = 'docs/reports/gate-01M79YYR766FTNCYF5STGZ3ANY/dual-report.md';
const SHOPLAB_AB = 'docs/reports/dual-shoplab/dual-report.md';
const SHOPLAB_GATE = 'docs/reports/gate-01M796CT3J5XRRXAREPJ88M525/dual-report.md';
const LAUNCH_DAY = 'docs/reports/launch-day-shoplab.md';
const TRADEOFF = 'docs/reports/tradeoff-01M786YYJN2NDQHVQT1HGGNY93.md';
const BENCHMARK = 'docs/reports/benchmark-juice-shop.md';

export const LAUNCH = {
  juiceGate: {
    confirmed: {
      value: 6,
      source: JUICE_GATE,
      evidence: '6 reproducible PoC(s)',
    },
    cost: { value: 0.82, source: JUICE_GATE, evidence: 'Total cost: 0.82 €' },
    regressionTests: {
      value: 937,
      source: JUICE_GATE,
      evidence: '937 tests pass',
    },
  },
  shoplabAB: {
    value: { delta: 50, low: 17, high: 83 },
    source: SHOPLAB_AB,
    evidence: 'B − A: 50.0 pts, 95 % interval [16.7 pts, 83.3 pts]',
  },
  shoplabGateCost: { value: 0.28, source: SHOPLAB_GATE, evidence: 'Total cost: 0.28 €' },
  strictRateLimit: {
    value: { attacksA: 100, attacksB: 0, blockedA: 0, blockedB: 18, successA: 75, successB: 73 },
    source: LAUNCH_DAY,
    evidence: '| rate limit per client 6/60 | shared | 100 % → 0 % | 75 % → 73 % | 0 % → 18 % |',
  },
  lockout: {
    value: { before: '4/6', lockout: '3/6', recommended: '5/6' },
    source: TRADEOFF,
    evidence: '| account lockout   | no               | 4/6 → 3/6',
  },
  benchmark: {
    value: { solved: 6, total: 60, recall: 10.0, low: 4.7, high: 20.1 },
    source: BENCHMARK,
    evidence: '6/60 = 10.0 % | [4.7 %, 20.1 %]',
  },
} as const;

/** All sourced figures, flattened, for the test. */
export function allSourced(): Sourced<unknown>[] {
  const out: Sourced<unknown>[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    if ('source' in node && 'evidence' in node && 'value' in node) {
      out.push(node as Sourced<unknown>);
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(LAUNCH);
  return out;
}

/** GitHub link to a report, for the footnotes. */
export function sourceUrl(path: string): string {
  return `https://github.com/oblivionwing26/janus-arena/blob/main/${path}`;
}
