import { z } from 'zod';

/**
 * What a request to a target is for (F3.1). `browse` and `http-probe` only look; the rest are
 * offensive and need verified ownership of the target (ADR 0005).
 */
export const TEST_TYPES = [
  'browse',
  'http-probe',
  'idor',
  'auth-bypass',
  'xss',
  'business-logic',
  'brute-force',
  'race',
  'scanner',
  /** Traffic at a rate a defense should notice, to measure it (F4.1, ADR 0020). */
  'saturation',
] as const;
export const testTypeSchema = z.enum(TEST_TYPES);
export type TestType = z.infer<typeof testTypeSchema>;

/** Why the network guard refused a request. */
export const BLOCK_REASONS = [
  'out-of-scope-origin',
  'excluded-path',
  'test-not-allowed',
  'not-verified',
  'rate-limited',
] as const;
export const blockReasonSchema = z.enum(BLOCK_REASONS);
export type BlockReason = z.infer<typeof blockReasonSchema>;
