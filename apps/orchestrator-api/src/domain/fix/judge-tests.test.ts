import { describe, expect, it } from 'vitest';

import { judgeTests, type TestResults } from './judge-tests.js';

const REGRESSION = 'test/api/janus-regression-x.test.ts > janus regression > leaks';
const results = (entries: Record<string, 'pass' | 'fail'>): TestResults =>
  new Map(Object.entries(entries));

const BASE = results({
  [REGRESSION]: 'fail',
  'test/api/basket.test.ts > /rest/basket/:id > GET existing basket of another user': 'pass',
  'test/api/basket.test.ts > /api/Baskets > GET all baskets is not part of API': 'pass',
  'test/api/angular-dist.test.ts > (file)': 'fail',
});
const VULNERABLE = [
  'test/api/basket.test.ts > /rest/basket/:id > GET existing basket of another user',
];

describe('judgeTests (F3.5, V2)', () => {
  it('passes when the regression test now passes and only listed vulnerability tests broke', () => {
    const patch = results({
      [REGRESSION]: 'pass',
      'test/api/basket.test.ts > /rest/basket/:id > GET existing basket of another user': 'fail',
      'test/api/basket.test.ts > /api/Baskets > GET all baskets is not part of API': 'pass',
      'test/api/angular-dist.test.ts > (file)': 'fail',
    });

    const verdict = judgeTests({
      base: BASE,
      patch,
      regression: REGRESSION,
      vulnerable: VULNERABLE,
    });

    expect(verdict.passed).toBe(true);
    expect(verdict.details).toContain('1 test asserted the flaw');
  });

  it('fails when a test that passed on the base breaks and is not on the list', () => {
    const patch = results({
      [REGRESSION]: 'pass',
      'test/api/basket.test.ts > /rest/basket/:id > GET existing basket of another user': 'fail',
      'test/api/basket.test.ts > /api/Baskets > GET all baskets is not part of API': 'fail',
    });

    const verdict = judgeTests({
      base: BASE,
      patch,
      regression: REGRESSION,
      vulnerable: VULNERABLE,
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.details).toContain('GET all baskets is not part of API');
  });

  it('fails when the regression test does not fail on the base: it would prove nothing', () => {
    const base = new Map(BASE).set(REGRESSION, 'pass');

    const verdict = judgeTests({ base, patch: base, regression: REGRESSION, vulnerable: [] });

    expect(verdict).toMatchObject({ passed: false });
    expect(verdict.details).toContain('passes on the base');
  });

  it('fails when the regression test still fails on the fix', () => {
    const verdict = judgeTests({
      base: BASE,
      patch: BASE,
      regression: REGRESSION,
      vulnerable: VULNERABLE,
    });

    expect(verdict).toMatchObject({ passed: false });
    expect(verdict.details).toContain('still fails');
  });

  it('ignores tests that already failed on the base', () => {
    const patch = new Map(BASE).set(REGRESSION, 'pass');

    expect(judgeTests({ base: BASE, patch, regression: REGRESSION, vulnerable: [] }).passed).toBe(
      true,
    );
  });

  it('counts a test missing from the fix run as broken', () => {
    const patch = results({ [REGRESSION]: 'pass' });

    const verdict = judgeTests({
      base: BASE,
      patch,
      regression: REGRESSION,
      vulnerable: VULNERABLE,
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.details).toContain('GET all baskets is not part of API');
  });
});
