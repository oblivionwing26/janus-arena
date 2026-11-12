/** Each test's full name (`file > suite > test`) and whether it passed. */
export type TestResults = ReadonlyMap<string, 'pass' | 'fail'>;

export interface TestsVerdict {
  readonly passed: boolean;
  readonly details: string;
}

const MAX_LISTED = 10;

/**
 * The second verifier's rule (F3.5, V2): the target's tests on the base and on the fix, compared.
 * The regression test generated from the PoC must fail on the base (or it proves nothing) and
 * pass on the fix. No test that passed on the base may fail or vanish on the fix, except those
 * listed as asserting the very flaw being fixed (Juice Shop tests its own vulnerabilities).
 */
export function judgeTests(input: {
  readonly base: TestResults;
  readonly patch: TestResults;
  readonly regression: string;
  readonly vulnerable: readonly string[];
}): TestsVerdict {
  const { base, patch, regression } = input;
  if (base.get(regression) !== 'fail') {
    return {
      passed: false,
      details: 'the regression test passes on the base, so it proves nothing',
    };
  }
  if (patch.get(regression) !== 'pass') {
    return { passed: false, details: 'the regression test still fails on the fix' };
  }
  const vulnerable = new Set(input.vulnerable);
  const broken = [...base]
    .filter(
      ([name, result]) => result === 'pass' && name !== regression && patch.get(name) !== 'pass',
    )
    .map(([name]) => name);
  const expected = broken.filter((name) => vulnerable.has(name));
  const regressions = broken.filter((name) => !vulnerable.has(name));
  const asserted = `${String(expected.length)} test${expected.length === 1 ? '' : 's'} asserted the flaw`;
  if (regressions.length > 0) {
    return {
      passed: false,
      details: `${String(regressions.length)} test(s) that passed on the base fail on the fix: ${regressions
        .slice(0, MAX_LISTED)
        .join('; ')}`,
    };
  }
  const passing = [...patch.values()].filter((result) => result === 'pass').length;
  return {
    passed: true,
    details: `the regression test fails on the base and passes on the fix; ${String(passing)} tests pass, ${asserted}`,
  };
}
