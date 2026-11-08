import { ScopeBlockedError } from '../../domain/scope/network-guard.js';
import type { ScopedHttpClient, ScopedRequest } from '../../domain/scope/scoped-http-port.js';

export interface RaceResult {
  readonly sent: number;
  /** How many requests the guard refused (the policy's rate caps a race). */
  readonly blocked: number;
  /** Requests that failed in transit (timeouts, resets). */
  readonly failed: number;
  /** Count of each response status, e.g. `{ 200: 3, 403: 2 }`. */
  readonly statuses: Readonly<Record<number, number>>;
  /** How many different bodies came back. */
  readonly distinctBodies: number;
  readonly elapsedMs: number;
}

export const MAX_RACE = 50;

/**
 * The race harness (F3.2): fires `n` identical requests at once, by code, and aggregates what
 * came back. Each request still passes the guard, so a race never outruns the scope's rate.
 */
export async function race(
  client: ScopedHttpClient,
  request: ScopedRequest,
  n: number,
  now: () => number = Date.now,
): Promise<RaceResult> {
  if (!Number.isInteger(n) || n < 2 || n > MAX_RACE) {
    throw new RangeError(`A race needs 2 to ${String(MAX_RACE)} requests, got ${String(n)}`);
  }
  const start = now();
  const outcomes = await Promise.allSettled(
    Array.from({ length: n }, () => client.send({ ...request, testType: 'race' })),
  );
  const elapsedMs = now() - start;

  const statuses: Record<number, number> = {};
  const bodies = new Set<string>();
  let blocked = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      statuses[outcome.value.status] = (statuses[outcome.value.status] ?? 0) + 1;
      bodies.add(outcome.value.body);
    } else if (outcome.reason instanceof ScopeBlockedError) {
      blocked += 1;
    } else {
      failed += 1;
    }
  }
  return { sent: n, blocked, failed, statuses, distinctBodies: bodies.size, elapsedMs };
}
