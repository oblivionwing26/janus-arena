import { verdict, type OracleVerdict } from './oracle-verdict.js';

/**
 * Race condition (F3.2): an effect that may happen once per actor happened more often, as
 * counted in the target's own record (who liked a review, who redeemed a coupon...).
 */
export function duplicateEffect(
  record: readonly string[],
  actor: string,
  allowed = 1,
): OracleVerdict {
  const count = record.filter((entry) => entry === actor).length;
  return count > allowed
    ? verdict(
        true,
        `${actor} appears ${String(count)} times where at most ${String(allowed)} is allowed`,
      )
    : verdict(false, `${actor} appears ${String(count)} times`);
}
