import { isKnownEvent, type JanusEvent, type UnknownEvent } from '@janus/shared-kernel';

import type { FixVerification } from './fix-verifier.js';

/**
 * The third verifier's thresholds (F3.5, V3), agreed with the product owner: with 4 personas ×
 * 2 seeds per variant, a tighter success tolerance would reject fixes over noise, and the p95
 * margin absorbs the sandbox's own jitter on endpoints that answer in a few milliseconds.
 */
export const V3_POLICY = { successTolerance: 0.25, p95: { ratio: 1.25, ms: 50 } } as const;

export interface EndpointLatency {
  /** `METHOD /route`, as in the surface map. */
  readonly endpoint: string;
  /** p95 in milliseconds on each variant; null when no shopper reached it there. */
  readonly a: number | null;
  readonly b: number | null;
}

const points = (value: number) => `${String(Math.round(value * 1000) / 10)} points`;

/**
 * V3's rule (F3.5): a fix fails when the personas' success rate on B is significantly lower
 * than on A (the paired bootstrap of B − A lies wholly below 0) or drops by more than the
 * tolerance, or when the p95 of an endpoint the fix touched exceeds its budget on B:
 * max(p95 on A × ratio, p95 on A + ms). An endpoint no shopper reached on both is reported, not
 * judged: if the fix broke the way to it, the success rate shows it.
 */
export function judgeUx(input: {
  readonly a: { readonly successes: number; readonly n: number } | null;
  readonly b: { readonly successes: number; readonly n: number } | null;
  readonly difference: {
    readonly mean: number;
    readonly low: number;
    readonly high: number;
  } | null;
  readonly latency: readonly EndpointLatency[];
}): FixVerification {
  const { a, b, difference, latency } = input;
  if (a === null || b === null || a.n === 0 || b.n === 0) {
    return { passed: false, details: 'a variant had no persona session to judge' };
  }
  const rateA = a.successes / a.n;
  const rateB = b.successes / b.n;
  const success = `success A ${String(a.successes)}/${String(a.n)}, B ${String(b.successes)}/${String(b.n)}`;
  const problems: string[] = [];
  if (difference !== null && difference.high < 0) {
    problems.push(
      `success on B is significantly lower (B − A in [${points(difference.low)}, ${points(difference.high)}])`,
    );
  }
  if (rateA - rateB > V3_POLICY.successTolerance + 1e-9) {
    problems.push(
      `success dropped ${points(rateA - rateB)}, over the ${points(V3_POLICY.successTolerance)} tolerance`,
    );
  }
  const lines = latency.map(({ endpoint, a: before, b: after }) => {
    if (before === null || after === null) return `${endpoint} not measured on both variants`;
    const budget = Math.max(before * V3_POLICY.p95.ratio, before + V3_POLICY.p95.ms);
    const line = `${endpoint} p95 ${String(Math.round(before))} → ${String(Math.round(after))} ms (budget ${String(Math.round(budget))} ms)`;
    if (after > budget) problems.push(`over its latency budget: ${line}`);
    return line;
  });
  return problems.length > 0
    ? { passed: false, details: [...problems, success].join('; ') }
    : { passed: true, details: [success, ...lines].join('; ') };
}

/** Express-style route (`/rest/basket/:id`) as a pattern for request paths. */
function routePattern(route: string): RegExp {
  const source = route
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}/?$`);
}

/** Linear-interpolation quantile of sorted values (same as @janus/stats). */
function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const low = sorted[below] ?? 0;
  const high = sorted[Math.min(below + 1, sorted.length - 1)] ?? low;
  return low + (high - low) * (position - below);
}

/**
 * The p95, in milliseconds, of the API requests a variant's sessions made to one endpoint
 * (F3.5, V3), from their page.requests events; null when none did.
 */
export function endpointP95(
  events: readonly (JanusEvent | UnknownEvent)[],
  variant: string,
  endpoint: { readonly method: string; readonly route: string },
): number | null {
  const known = events.filter(isKnownEvent);
  const agents = new Set(
    known.flatMap((event) =>
      event.type === 'session.started' && event.payload.variant === variant
        ? [event.actor.agentId]
        : [],
    ),
  );
  const pattern = routePattern(endpoint.route);
  const times = known
    .flatMap((event) =>
      event.type === 'page.requests' && agents.has(event.actor.agentId)
        ? event.payload.requests
        : [],
    )
    .filter((request) => request.method === endpoint.method && pattern.test(request.path))
    .map((request) => request.ms)
    .sort((x, y) => x - y);
  return times.length === 0 ? null : quantile(times, 0.95);
}
