import { verdict, type OracleVerdict } from './oracle-verdict.js';

/** What a saboteur got back for each request of a steady stream (F4.1). */
export interface SaturationRun {
  readonly replies: readonly { readonly status: number | null }[];
  /** The pace the saboteur kept, for the evidence. */
  readonly requestsPerSecond: number;
}

/** Fewer requests than this prove nothing about a rate limit. */
export const MIN_REQUESTS = 10;
/** Answers that mean the shop pushed back: too many requests, or unavailable under load. */
const PUSHED_BACK = new Set([429, 503]);

/**
 * Saturation (F4.1): the shop takes load at a steady rate. Exploitable when enough requests were
 * sent, every one was answered and none was refused (429) or met a shop that gave way (503). A
 * rate limit shows as the first refusal, which is how a defense's effect on abuse is measured.
 */
export function unthrottledRequests(run: SaturationRun): OracleVerdict {
  const { replies } = run;
  if (replies.length === 0) return verdict(false, 'no request was made');
  const unanswered = replies.findIndex((reply) => reply.status === null);
  if (unanswered !== -1) {
    return verdict(false, `request ${String(unanswered + 1)} got no answer, so nothing is proven`);
  }
  const pushed = replies.findIndex((reply) => PUSHED_BACK.has(reply.status ?? 0));
  if (pushed !== -1) {
    return verdict(
      false,
      `the shop pushed back: refused at request ${String(pushed + 1)} (${String(replies[pushed]?.status)})`,
    );
  }
  if (replies.length < MIN_REQUESTS) {
    return verdict(
      false,
      `only ${String(replies.length)} requests were sent, fewer than the ${String(MIN_REQUESTS)} that prove a rate`,
    );
  }
  return verdict(
    true,
    `${String(replies.length)} requests at ${String(run.requestsPerSecond)} per second were all answered, none refused or slowed by the shop`,
  );
}
