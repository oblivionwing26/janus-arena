import { describe, expect, it } from 'vitest';

import { recommend, type TradeoffRow } from './tradeoff.js';

const LOGIN = 'POST /rest/user/login';
const row = (
  label: string,
  exploitable: boolean | null,
  successB: number,
  p95B: number | null,
): TradeoffRow => ({
  label,
  strategy: label,
  patchId: `01JC0F2EB7E00000000000${label.length.toString().padStart(4, '0')}`,
  exploitable,
  ux: {
    runId: '01JC0F2EB7E0000000000000AA',
    a: { successes: 4, n: 6 },
    b: { successes: successB, n: 6 },
    latency: [{ endpoint: LOGIN, a: 60, b: p95B }],
  },
  uxPassed: successB >= 4,
  note: '',
});

describe('recommend (F3.6)', () => {
  it('picks the safe alternative that keeps the most shoppers', () => {
    const lockout = row('account lockout', false, 2, 70);
    const limit = row('per-account limit', false, 4, 65);
    const delay = row('progressive delay', false, 4, 2400);

    const { row: chosen, reason } = recommend([lockout, limit, delay]);

    expect(chosen).toBe(limit);
    expect(reason).toContain('per-account limit closes the attack');
    expect(reason).toContain('4/6 shoppers succeed (4/6 on the original)');
    expect(reason).toContain('account lockout: 2/6');
  });

  it('never recommends an alternative that leaves the attack open, however good its UX', () => {
    const open = row('none', true, 6, 50);
    const lockout = row('account lockout', false, 2, 70);

    expect(recommend([open, lockout]).row).toBe(lockout);
  });

  it('breaks a tie in success by the lower p95 of the touched endpoint', () => {
    const fast = row('per-account limit', false, 4, 65);
    const slow = row('progressive delay', false, 4, 2400);

    expect(recommend([slow, fast]).row).toBe(fast);
  });

  it('recommends nothing when no alternative closes the attack', () => {
    expect(recommend([row('none', true, 6, 50)])).toEqual({
      row: null,
      reason: 'no alternative closed the attack (V1)',
    });
  });

  it('ignores an alternative V3 could not measure', () => {
    const unmeasured: TradeoffRow = { ...row('broken', false, 6, 50), ux: null, uxPassed: null };

    expect(recommend([unmeasured]).row).toBeNull();
  });
});
