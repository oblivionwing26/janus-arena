import type { TestType } from '@janus/shared-kernel';

export { TEST_TYPES, type TestType } from '@janus/shared-kernel';

/** `browse` and `http-probe` only look; every other test is offensive (ADR 0005). */
export function isOffensive(testType: TestType): boolean {
  return testType !== 'browse' && testType !== 'http-probe';
}
