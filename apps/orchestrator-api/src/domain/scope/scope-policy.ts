import { DomainError } from '../errors/domain-error.js';
import { TEST_TYPES, type TestType } from './test-type.js';

/**
 * What Janus may touch on a target (F3.1, ADR 0005): the origins it may reach, the paths it must
 * never request, the kinds of test allowed and how fast it may go.
 */
export interface ScopePolicy {
  readonly target: string;
  /** Origins (`http://host:port`), compared exactly. */
  readonly origins: readonly string[];
  /**
   * Paths never requested, case-insensitive: exact (`/api/Hints`), a prefix ending in `*`
   * (`/rest/continue-code*`) or a subtree ending in `/**` (`/snippets/**`).
   */
  readonly excludedPaths: readonly string[];
  readonly allowedTests: readonly TestType[];
  readonly maxRequestsPerSecond: number;
}

export class InvalidScopePolicyError extends DomainError {
  readonly code = 'scope.invalid-policy';
}

const PATTERN = /^\/[^*?#]*(?:\*|\/\*\*)?$/;

/** A validated policy; refuses wildcards in origins and patterns it cannot read. */
export function createScopePolicy(input: ScopePolicy): ScopePolicy {
  if (input.origins.length === 0) {
    throw new InvalidScopePolicyError(`Scope of ${input.target} allows no origin`);
  }
  for (const origin of input.origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new InvalidScopePolicyError(`Not an origin: ${origin}`);
    }
    if (!/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/.test(parsed.hostname)) {
      throw new InvalidScopePolicyError(`Not an origin (wildcard or odd host): ${origin}`);
    }
    if (parsed.origin !== origin || !/^https?:$/.test(parsed.protocol)) {
      throw new InvalidScopePolicyError(`Not an http(s) origin without path: ${origin}`);
    }
  }
  for (const path of input.excludedPaths) {
    if (!PATTERN.test(path)) throw new InvalidScopePolicyError(`Bad excluded path: ${path}`);
  }
  for (const test of input.allowedTests) {
    if (!TEST_TYPES.includes(test)) throw new InvalidScopePolicyError(`Unknown test: ${test}`);
  }
  if (!(input.maxRequestsPerSecond > 0 && input.maxRequestsPerSecond <= 1000)) {
    throw new InvalidScopePolicyError('maxRequestsPerSecond must be in (0, 1000]');
  }
  return input;
}

/**
 * The path as the target is likely to route it: percent-decoded, `.` and `..` resolved, repeated
 * and trailing slashes dropped, lower-cased (Express routes ignore case by default).
 */
export function canonicalPath(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes stay as they are and are compared literally.
  }
  const parts: string[] = [];
  for (const part of decoded.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part.toLowerCase());
  }
  return `/${parts.join('/')}`;
}

/** True when the path matches one of the policy's excluded patterns. */
export function isExcludedPath(policy: ScopePolicy, pathname: string): boolean {
  const path = canonicalPath(pathname);
  return policy.excludedPaths.some((pattern) => {
    const lower = pattern.toLowerCase();
    if (lower.endsWith('/**')) {
      const base = canonicalPath(lower.slice(0, -3));
      return path === base || path.startsWith(`${base}/`);
    }
    if (lower.endsWith('*')) return path.startsWith(canonicalPath(lower.slice(0, -1)));
    return path === canonicalPath(lower);
  });
}
