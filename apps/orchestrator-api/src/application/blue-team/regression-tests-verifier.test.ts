// F3.5, V2: the target's tests on the base and on the fix, judged by code. A fake test port.

import type { ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { FixUnderTest } from '../../domain/fix/fix-verifier.js';
import type { GeneratedTest } from '../../domain/fix/generated-test.js';
import type { TestResults } from '../../domain/fix/judge-tests.js';
import type { TargetTestsPort } from '../../domain/fix/target-tests-port.js';
import { RegressionTestsVerifier } from './regression-tests-verifier.js';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};
const FIX: FixUnderTest = {
  runId: '01JC0F28B7E0000000000000AA',
  target: 'juice-shop',
  findingId: '01JC0F28B7E0000000000000FF',
  poc: POC,
  repo: 'file:///workspaces/x',
  base: BASE,
  head: HEAD,
  changedFiles: ['routes/basket.ts'],
  variantId: 'fix-x',
  baseUrl: 'http://janus-fix-x-app:3000',
};
const REGRESSION: GeneratedTest = {
  path: 'test/api/janus-regression-x.test.ts',
  name: 'test/api/janus-regression-x.test.ts > janus > leaks',
  source: '// test',
};
const OTHER_USER =
  'test/api/basket.test.ts > /rest/basket/:id > GET existing basket of another user';

class FakeTests implements TargetTestsPort {
  readonly runs: { commit: string; extra: readonly GeneratedTest[] }[] = [];
  constructor(private readonly byCommit: Record<string, TestResults>) {}
  run(input: { commit: string; extra: readonly GeneratedTest[] }): Promise<TestResults> {
    this.runs.push(input);
    return Promise.resolve(this.byCommit[input.commit] ?? new Map());
  }
}

const results = (entries: Record<string, 'pass' | 'fail'>): TestResults =>
  new Map(Object.entries(entries));

function verifier(tests: FakeTests, generate: GeneratedTest | null = REGRESSION) {
  return new RegressionTestsVerifier({
    tests,
    generate: () => generate,
    vulnerable: (target, endpoint) =>
      target === 'juice-shop' && endpoint === 'GET /rest/basket/:id' ? [OTHER_USER] : [],
  });
}

describe('RegressionTestsVerifier (F3.5, V2)', () => {
  it('runs base and fix with the generated test, and passes a fix that only breaks the listed test', async () => {
    const tests = new FakeTests({
      [BASE]: results({ [REGRESSION.name]: 'fail', [OTHER_USER]: 'pass' }),
      [HEAD]: results({ [REGRESSION.name]: 'pass', [OTHER_USER]: 'fail' }),
    });

    const result = await verifier(tests).verify(FIX);

    expect(result.passed).toBe(true);
    expect(tests.runs.map((run) => run.commit)).toEqual([BASE, HEAD]);
    expect(tests.runs.every((run) => run.extra[0] === REGRESSION)).toBe(true);
  });

  it('runs the base once per finding, across iterations', async () => {
    const tests = new FakeTests({
      [BASE]: results({ [REGRESSION.name]: 'fail' }),
      [HEAD]: results({ [REGRESSION.name]: 'pass' }),
    });
    const v2 = verifier(tests);

    await v2.verify(FIX);
    await v2.verify(FIX);

    expect(tests.runs.map((run) => run.commit)).toEqual([BASE, HEAD, HEAD]);
  });

  it('fails when no regression test can be written for the PoC', async () => {
    const result = await verifier(new FakeTests({}), null).verify(FIX);

    expect(result).toEqual({
      passed: false,
      details: 'no regression test can be generated from a idor PoC yet',
    });
  });
});
