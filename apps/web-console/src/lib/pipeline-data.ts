// What each station of the launch page's pipeline shows, taken from the repository: the persona
// files, the two gate reports and the README. pipeline-data.test.ts checks every evidence string.

import type { Sourced } from './launch-data';

const JUICE_GATE = 'docs/reports/gate-01M79YYR766FTNCYF5STGZ3ANY/dual-report.md';
const SHOPLAB_GATE = 'docs/reports/gate-01M796CT3J5XRRXAREPJ88M525/dual-report.md';

export type Face = 'ux' | 'gate' | 'security' | 'trust';

export interface Persona {
  name: string;
  trait: string;
  device: 'desktop' | 'mobile';
  literacy: number;
  source: string;
  evidence: string;
}

const persona = (
  file: string,
  name: string,
  trait: string,
  device: Persona['device'],
  literacy: number,
): Persona => ({
  name,
  trait,
  device,
  literacy,
  source: `personas/${file}.yaml`,
  evidence: `digitalLiteracy: ${literacy}`,
});

export const PERSONAS: readonly Persona[] = [
  persona('carmen-retired', 'Carmen', 'Retired, reads every word', 'desktop', 2),
  persona('diego-commuter', 'Diego', 'Buys between meetings', 'mobile', 4),
  persona('ines-forgetful', 'Inés', 'Never sure of her password', 'desktop', 3),
  persona('javier-budget', 'Javier', 'Stops if the total changes', 'desktop', 3),
  persona('lucia-private', 'Lucía', 'Guards her personal data', 'desktop', 4),
  persona('marta-first-phone', 'Marta', 'First smartphone, last year', 'mobile', 2),
  persona('pablo-student', 'Pablo', 'Skips anything to read', 'mobile', 5),
];

export interface Finding {
  severity: 'critical' | 'high';
  where: string;
  kind: string;
  oracle: string;
}

export const JUICE_FINDINGS: Sourced<readonly Finding[]> = {
  source: JUICE_GATE,
  evidence: 'user 26 received a record of user 25',
  value: [
    {
      severity: 'high',
      where: 'GET /rest/basket/:id',
      kind: 'IDOR',
      oracle: 'user 26 received a record of user 25',
    },
    {
      severity: 'critical',
      where: 'POST /rest/user/login',
      kind: 'Login bypass',
      oracle: 'a session for admin@juice-sh.op was opened without its credentials',
    },
    {
      severity: 'high',
      where: 'GET /#/search',
      kind: 'XSS',
      oracle: 'a dialog (alert) showed the marker',
    },
    {
      severity: 'high',
      where: 'PUT /api/BasketItems/:id',
      kind: 'Business logic',
      oracle: 'the order total is negative: -1.99',
    },
    {
      severity: 'high',
      where: 'POST /rest/products/reviews',
      kind: 'Business logic',
      oracle: 'appears 6 times where at most 1 is allowed',
    },
    {
      severity: 'high',
      where: 'POST /rest/user/login',
      kind: 'Brute force',
      oracle: '20 wrong passwords were refused in 48 ms each on average, none throttled',
    },
  ],
};

/** What the Red Team run of the Juice Shop gate covered (recorded run; attack-tree.ts counts it). */
export const JUICE_RED_TOTALS: Sourced<{ mapped: number; attempts: number; blocked: number }> = {
  source: 'apps/web-console/public/demo/runs/01M79ZA35SZ9QRNF6K3AAGXNQN.json',
  evidence: '"scope.blocked"',
  value: { mapped: 106, attempts: 32, blocked: 6 },
};

export interface Verifier {
  name: string;
  label: string;
  detail: string;
}

export const JUICE_VERIFIERS: Sourced<readonly Verifier[]> = {
  source: JUICE_GATE,
  evidence: 'fixed after 1 iteration(s)',
  value: [
    {
      name: 'build-checks',
      label: 'Builds',
      detail: 'the patched variant compiles (tsc) and starts',
    },
    { name: 'poc-replay', label: 'V1 · PoC replay', detail: 'the PoC no longer works: status 403' },
    {
      name: 'regression-tests',
      label: 'V2 · Tests',
      detail: 'the regression test fails on the base and passes on the fix; 937 tests pass',
    },
    {
      name: 'synthlab-rerun',
      label: 'V3 · SynthLab re-run',
      detail: 'success A 4/8, B 2/8; GET /rest/basket/:id p95 108 → 118 ms (budget 158 ms)',
    },
  ],
};

export const JUICE_SYNTHLAB_A: Sourced<{ personas: string; baseline: string }> = {
  source: JUICE_GATE,
  evidence: '| a | 4/8 | 2/2 |',
  value: { personas: '4/8', baseline: '2/2' },
};

export const SHOPLAB_GATE_AB: Sourced<{
  a: [number, number];
  b: [number, number];
  delta: number;
  low: number;
  high: number;
}> = {
  source: SHOPLAB_GATE,
  evidence: 'B − A: 83.3 pts, 95 % interval [50.0 pts, 100.0 pts]',
  value: { a: [0, 6], b: [5, 6], delta: 83.3, low: 50, high: 100 },
};

export const SHOPLAB_AUDIT: Sourced<string> = {
  source: 'README.md',
  evidence: 'the differential audit finds nothing B introduces',
  value: 'nothing',
};

const VARIANT_RUN = 'apps/web-console/public/demo/runs/01M796SFQ01XX971E4VC99YNR3.json';
const AUDIT_RUN = 'apps/web-console/public/demo/runs/01M797M96H2ZDM7K31R7ZM9SY3.json';

export interface VariantPatch {
  page: string;
  problem: string;
  patch: string;
  checks: string;
}

/** The two patches the UI Engineer wrote for ShopLab's variant B (recorded run). */
export const SHOPLAB_PATCHES: Sourced<readonly VariantPatch[]> = {
  source: VARIANT_RUN,
  evidence: 'Otras opciones',
  value: [
    {
      page: '/cart',
      problem: 'The coupon form hid behind a vague “Otras opciones” link',
      patch: 'Show the coupon field and button on the cart page',
      checks: 'lint, typecheck and tests passed in 37 s',
    },
    {
      page: '/checkout',
      problem: 'Checkout showed only totals, so shoppers went back to the cart',
      patch: 'Add an order summary with each item and its price',
      checks: 'lint, typecheck and tests passed in 97 s',
    },
  ],
};

/** What the differential audit found variant B introduces (recorded run). */
export const SHOPLAB_AUDIT_RESULT: Sourced<{
  findings: number;
  endpoints: number;
  high: number;
  critical: number;
  blocked: boolean;
}> = {
  source: AUDIT_RUN,
  evidence: 'audit.completed',
  value: { findings: 0, endpoints: 0, high: 0, critical: 0, blocked: false },
};

export const PIPELINE_SOURCES = [
  JUICE_GATE,
  SHOPLAB_GATE,
  'README.md',
  ...PERSONAS.map((p) => p.source),
];
