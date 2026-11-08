import type { FindingSeverity, StaticFinding } from '../../domain/analysis/static-finding.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';

/** What variant B changes in the HTTP surface that matters for security (F2.7). */
export interface EndpointChange {
  readonly endpoint: Endpoint;
  readonly change: 'new-public' | 'lost-auth' | 'new-idor-lead';
  readonly severity: FindingSeverity;
  readonly reason: string;
}

export interface GateVerdict {
  readonly blocked: boolean;
  readonly high: number;
  readonly critical: number;
  /** One line per high or critical change, the reasons B is blocked. */
  readonly reasons: readonly string[];
}

/**
 * A finding's identity across A and B: tool, rule, file and the code it points at, not the line
 * number, so code that only moved does not look new.
 */
function findingKey(finding: StaticFinding): string {
  return [
    finding.tool,
    finding.rule,
    finding.file,
    finding.snippet.replace(/\s+/g, ' ').trim(),
  ].join('\u0000');
}

/**
 * The findings B has that A has not (F2.7), counted as a multiset: if A has the same finding
 * twice and B three times, B introduces one.
 */
export function introducedFindings(
  base: readonly StaticFinding[],
  variant: readonly StaticFinding[],
): StaticFinding[] {
  const remaining = new Map<string, number>();
  for (const finding of base) {
    const key = findingKey(finding);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return variant.filter((finding) => {
    const key = findingKey(finding);
    const left = remaining.get(key) ?? 0;
    if (left === 0) return true;
    remaining.set(key, left - 1);
    return false;
  });
}

const endpointKey = (endpoint: Endpoint) => `${endpoint.method} ${endpoint.route}`;

/**
 * How B changes the HTTP surface (F2.7): a new endpoint without auth (reported, medium: many
 * endpoints are public on purpose), an endpoint that loses its auth (high), and a new IDOR lead:
 * a new endpoint with a session but no owner check, or an owner check that disappears (high).
 * Changes from or to `'unknown'` say nothing and do not count.
 */
export function surfaceChanges(
  base: readonly Endpoint[],
  variant: readonly Endpoint[],
): EndpointChange[] {
  const before = new Map(base.map((endpoint) => [endpointKey(endpoint), endpoint]));
  const changes: EndpointChange[] = [];
  for (const endpoint of variant) {
    const previous = before.get(endpointKey(endpoint));
    if (previous === undefined) {
      if (!endpoint.auth) {
        changes.push({
          endpoint,
          change: 'new-public',
          severity: 'medium',
          reason: 'new endpoint that demands no session',
        });
      } else if (endpoint.ownerCheck === false) {
        changes.push({
          endpoint,
          change: 'new-idor-lead',
          severity: 'high',
          reason: 'new endpoint with a session but no owner check (IDOR lead)',
        });
      }
      continue;
    }
    if (previous.auth && !endpoint.auth) {
      changes.push({
        endpoint,
        change: 'lost-auth',
        severity: 'high',
        reason: 'no longer demands a session',
      });
    } else if (previous.ownerCheck === true && endpoint.ownerCheck === false) {
      changes.push({
        endpoint,
        change: 'new-idor-lead',
        severity: 'high',
        reason: 'no longer filters by the session user (IDOR lead)',
      });
    }
  }
  return changes;
}

/** The gate (F2.7): B is blocked when it introduces anything high or critical. */
export function gate(
  findings: readonly StaticFinding[],
  changes: readonly EndpointChange[],
): GateVerdict {
  const serious = (severity: FindingSeverity) => severity === 'high' || severity === 'critical';
  const reasons = [
    ...findings
      .filter((finding) => serious(finding.severity))
      .map(
        (finding) =>
          `${finding.tool} ${finding.rule} at ${finding.file}${finding.line > 0 ? `:${String(finding.line)}` : ''} (${finding.severity})`,
      ),
    ...changes
      .filter((change) => serious(change.severity))
      .map(
        (change) =>
          `${change.endpoint.method} ${change.endpoint.route}: ${change.reason} (${change.severity})`,
      ),
  ];
  const all = [...findings.map((f) => f.severity), ...changes.map((c) => c.severity)];
  return {
    blocked: reasons.length > 0,
    high: all.filter((severity) => severity === 'high').length,
    critical: all.filter((severity) => severity === 'critical').length,
    reasons,
  };
}
