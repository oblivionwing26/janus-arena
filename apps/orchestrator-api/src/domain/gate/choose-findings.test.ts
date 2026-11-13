import { describe, expect, it } from 'vitest';

import { chooseFindings } from './choose-findings.js';

describe('chooseFindings (F3.9)', () => {
  it('takes the most severe findings V2 can verify, and names the ones it cannot', () => {
    const result = chooseFindings(
      [
        { findingId: 'xss', severity: 'medium', verifiable: false },
        { findingId: 'login-bypass', severity: 'critical', verifiable: false },
        { findingId: 'quantity', severity: 'medium', verifiable: true },
        { findingId: 'basket-idor', severity: 'high', verifiable: true },
        { findingId: 'unknown', severity: undefined, verifiable: true },
      ],
      2,
    );

    // The critical login bypass is skipped: no regression test can be generated from its PoC.
    expect(result.chosen).toEqual(['basket-idor', 'quantity']);
    expect(result.unverifiable).toEqual(['xss', 'login-bypass']);
  });

  it('chooses nothing when no finding can be verified', () => {
    expect(
      chooseFindings([{ findingId: 'xss', severity: 'high', verifiable: false }], 1).chosen,
    ).toEqual([]);
  });
});
