import { describe, expect, it } from 'vitest';

import { recommend, type TradeoffRow } from '../../domain/fix/tradeoff.js';
import { formatTradeoff } from './format-tradeoff.js';

const LOGIN = 'POST /rest/user/login';
const row = (label: string, successB: number | null, p95B: number | null): TradeoffRow => ({
  label,
  strategy: label === 'free fix' ? null : label,
  patchId: '01JC0F2GB7E0000000000000PP',
  exploitable: successB === null ? true : false,
  ux:
    successB === null
      ? null
      : {
          runId: '01JC0F2GB7E0000000000000RR',
          a: { successes: 4, n: 6 },
          b: { successes: successB, n: 6 },
          latency: [{ endpoint: LOGIN, a: 61.4, b: p95B }],
        },
  uxPassed: successB === null ? null : successB >= 4,
  note: `notes for ${label}`,
});

describe('formatTradeoff (F3.6)', () => {
  const rows = [
    row('free fix', 2, 70),
    row('progressive delay', 4, 2400),
    row('per-account attempt limit', 4, 65),
  ];
  const markdown = formatTradeoff({
    title: 'brute-force at POST /rest/user/login',
    findingId: '01JC0F2GB7E0000000000000FF',
    runId: '01JC0F2GB7E0000000000000AA',
    target: 'juice-shop',
    rows,
    diffs: { 'free fix': 'diff --git a/routes/login.ts b/routes/login.ts\n+lock()\n' },
    recommendation: recommend(rows),
    costEur: 1.234,
  });

  it('has one table row per alternative: exploitable, success and p95', () => {
    expect(markdown).toContain(
      '| Alternative | Exploitable (V1) | Success, original → fix (V3) | p95 POST /rest/user/login | V3 |',
    );
    expect(markdown).toContain('| free fix | no | 4/6 → 2/6 | 61 → 70 ms | rejected |');
    expect(markdown).toContain(
      '| per-account attempt limit | no | 4/6 → 4/6 | 61 → 65 ms | passed |',
    );
  });

  it('states the recommendation, justified, and what it cost', () => {
    expect(markdown).toContain('**Recommendation:** per-account attempt limit closes the attack');
    expect(markdown).toContain('Cost: 1.23 €');
  });

  it('shows each alternative’s patch and notes', () => {
    expect(markdown).toContain('### free fix');
    expect(markdown).toContain(
      '```diff\ndiff --git a/routes/login.ts b/routes/login.ts\n+lock()\n```',
    );
    expect(markdown).toContain('notes for progressive delay');
  });

  it('marks an alternative that leaves the attack open, unmeasured by V3', () => {
    const open = formatTradeoff({
      title: 't',
      findingId: 'f',
      runId: 'r',
      target: 'juice-shop',
      rows: [row('free fix', null, null)],
      diffs: {},
      recommendation: recommend([row('free fix', null, null)]),
      costEur: 0,
    });

    expect(open).toContain('| free fix | **yes** | — | — | not run |');
  });
});
