// Phase 6 of the launch page, "what a fix costs": the five Launch Day defenses and the three
// alternatives to an account lockout, exactly as the reports in docs/reports print them.
// tradeoff-data.test.ts rebuilds each report row from these values and finds it in the report.

export const LAUNCH_DAY_REPORT = 'docs/reports/launch-day-shoplab.md';
export const TRADEOFF_REPORT = 'docs/reports/tradeoff-01M786YYJN2NDQHVQT1HGGNY93.md';

/** A rate with its 95 % Wilson interval, in whole percent, and the counts behind it. */
export interface Rate {
  p: number;
  lo: number;
  hi: number;
  k: number;
  n: number;
}

export interface VariantRow {
  defense: string;
  shoppers: number;
  success: Rate;
  blocked: Rate;
  medianSteps: number;
  attack: Rate;
}

export interface Defense {
  id: string;
  label: string;
  addresses: 'distinct' | 'shared';
  run: string;
  a: VariantRow;
  b: VariantRow;
}

const r = (p: number, lo: number, hi: number, k: number, n: number): Rate => ({ p, lo, hi, k, n });
const none = (shoppers: number, success: Rate, blocked: Rate, medianSteps: number): VariantRow => ({
  defense: 'none',
  shoppers,
  success,
  blocked,
  medianSteps,
  attack: r(100, 34, 100, 2, 2),
});

export const DEFENSES: readonly Defense[] = [
  {
    id: 'client-20-distinct',
    label: 'Rate limit per client, 20 a minute',
    addresses: 'distinct',
    run: '01M7C042BQ18AAGTQ6983VY9D7',
    a: none(14, r(86, 60, 96, 12, 14), r(0, 0, 22, 0, 14), 13),
    b: {
      defense: 'rate limit per client 20/60',
      shoppers: 16,
      success: r(88, 64, 97, 14, 16),
      blocked: r(0, 0, 19, 0, 16),
      medianSteps: 15,
      attack: r(50, 9, 91, 1, 2),
    },
  },
  {
    id: 'client-20-shared',
    label: 'Rate limit per client, 20 a minute, shared addresses',
    addresses: 'shared',
    run: '01M7C0X00PDK6TP50E5S4XFWFN',
    a: none(15, r(80, 55, 93, 12, 15), r(0, 0, 20, 0, 15), 16),
    b: {
      defense: 'rate limit per client 20/60',
      shoppers: 14,
      success: r(71, 45, 88, 10, 14),
      blocked: r(0, 0, 22, 0, 14),
      medianSteps: 15,
      attack: r(50, 9, 91, 1, 2),
    },
  },
  {
    id: 'account-3',
    label: 'Rate limit per account, 3 a minute',
    addresses: 'distinct',
    run: '01M7C1PZRN3DQ68BJVB8F9KHKX',
    a: none(15, r(80, 55, 93, 12, 15), r(0, 0, 20, 0, 15), 15),
    b: {
      defense: 'rate limit per account 3/60',
      shoppers: 14,
      success: r(79, 52, 92, 11, 14),
      blocked: r(0, 0, 22, 0, 14),
      medianSteps: 14.5,
      attack: r(50, 9, 91, 1, 2),
    },
  },
  {
    id: 'step-up',
    label: 'Checkout step-up for new accounts',
    addresses: 'distinct',
    run: '01M7C2Y015H82WC2XAHKYBGKD5',
    a: none(16, r(75, 51, 90, 12, 16), r(0, 0, 19, 0, 16), 15),
    b: {
      defense: 'checkout step-up (new-accounts)',
      shoppers: 15,
      success: r(73, 48, 89, 11, 15),
      blocked: r(0, 0, 20, 0, 15),
      medianSteps: 16,
      attack: r(100, 34, 100, 2, 2),
    },
  },
  {
    id: 'client-6-shared',
    label: 'Strict rate limit per client, 6 a minute, shared addresses',
    addresses: 'shared',
    run: '01M7CZ2ZADFTJSJ1GZFF5M38EE',
    a: none(16, r(75, 51, 90, 12, 16), r(0, 0, 19, 0, 16), 14),
    b: {
      defense: 'rate limit per client 6/60',
      shoppers: 11,
      success: r(73, 43, 90, 8, 11),
      blocked: r(18, 5, 48, 2, 11),
      medianSteps: 15,
      attack: r(0, 0, 66, 0, 2),
    },
  },
];

const pct = (x: Rate) => `${x.p} % (${x.lo} %–${x.hi} %, ${x.k}/${x.n})`;

/** The row of the report's per-run table for one variant, character for character. */
export function reportRow(variant: 'A' | 'B', row: VariantRow): string {
  return `| ${variant} | ${row.defense} | ${row.shoppers} | ${pct(row.success)} | ${pct(row.blocked)} | ${row.medianSteps} | ${pct(row.attack)} | 0 |`;
}

export interface Alternative {
  name: string;
  measured: boolean;
  exploitable: boolean | null;
  success: { before: number; after: number; of: number } | null;
  p95: { before: number; after: number; budget: number } | null;
  /** The report's own sentence about this alternative. */
  note: string;
  recommended: boolean;
}

export const LOCKOUT_ALTERNATIVES: readonly Alternative[] = [
  {
    name: 'Per-account rate limit',
    measured: true,
    exploitable: false,
    success: { before: 4, after: 5, of: 6 },
    p95: { before: 50, after: 90, budget: 100 },
    note: 'the PoC no longer works: the shop throttled at guess 11 (429)',
    recommended: true,
  },
  {
    name: 'Account lockout',
    measured: true,
    exploitable: false,
    success: { before: 4, after: 3, of: 6 },
    p95: { before: 46, after: 41, budget: 96 },
    note: 'Inés was refused with 429 in both sessions on B and never completed her purchase there',
    recommended: false,
  },
  {
    name: 'Progressive delay',
    measured: false,
    exploitable: null,
    success: null,
    p95: null,
    note: 'the Anthropic API credit ran out before the Blue Team wrote this alternative',
    recommended: false,
  },
];

/** The report calls the per-account limit "free fix" (the Blue Team's own patch). */
export const REPORT_NAMES: Record<string, string> = {
  'Per-account rate limit': 'free fix',
  'Account lockout': 'account lockout',
  'Progressive delay': 'progressive delay',
};
