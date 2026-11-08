import type { BlockReason } from '@janus/shared-kernel';

import { DomainError } from '../errors/domain-error.js';
import { isExcludedPath, type ScopePolicy } from './scope-policy.js';
import { isOffensive, type TestType } from './test-type.js';
import { VERIFICATION_PATH, VerifiedScope } from './verified-scope.js';

export type { BlockReason } from '@janus/shared-kernel';

export interface GuardedRequest {
  readonly method: string;
  readonly url: string;
  readonly testType: TestType;
}

export type GuardDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: BlockReason };

/** A request the guard refused, as recorded in scope.blocked: no query string, no body. */
export interface BlockedRequest {
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly testType: TestType;
  readonly reason: BlockReason;
}

export class ScopeBlockedError extends DomainError {
  readonly code = 'scope.blocked';

  constructor(readonly blocked: BlockedRequest) {
    super(
      `${blocked.method} ${blocked.origin}${blocked.path} blocked (${blocked.reason}, ${blocked.testType})`,
    );
  }
}

const WINDOW_MS = 1_000;

/**
 * Decides every request Janus makes to a target (F3.1, ADR 0005), in the HTTP client and the
 * browser alike: off-scope origins, excluded paths and tests the policy does not allow are
 * blocked; offensive tests also need the scope verified; and nothing goes faster than the
 * policy's rate. Pure apart from the clock it is given.
 */
export class NetworkGuard {
  private readonly policy: ScopePolicy;
  private readonly verified: boolean;
  private readonly sent: number[] = [];

  constructor(
    scope: ScopePolicy | VerifiedScope,
    private readonly now: () => number = Date.now,
  ) {
    this.verified = scope instanceof VerifiedScope;
    this.policy = scope instanceof VerifiedScope ? scope.policy : scope;
  }

  /** A browsing-only guard for a single origin: what SynthLab sessions get. */
  static forOrigin(target: string, baseUrl: string, maxRequestsPerSecond = 200): NetworkGuard {
    return new NetworkGuard({
      target,
      origins: [new URL(baseUrl).origin],
      excludedPaths: [],
      allowedTests: ['browse'],
      maxRequestsPerSecond,
    });
  }

  get target(): string {
    return this.policy.target;
  }

  /** Decides the request; an allowed one counts toward the rate limit. */
  check(request: GuardedRequest): GuardDecision {
    const reason = this.reasonToBlock(request);
    if (reason !== null) return { allowed: false, reason };
    this.sent.push(this.now());
    return { allowed: true };
  }

  /** The blocked request as it may be recorded: origin and path only. */
  describe(request: GuardedRequest, reason: BlockReason): BlockedRequest {
    let origin = 'invalid-url';
    let path = '';
    try {
      const url = new URL(request.url);
      origin = url.origin;
      path = url.pathname.slice(0, 300);
    } catch {
      // Recorded as an invalid URL, without echoing it.
    }
    return {
      method: request.method.toUpperCase(),
      origin,
      path,
      testType: request.testType,
      reason,
    };
  }

  private reasonToBlock(request: GuardedRequest): BlockReason | null {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return 'out-of-scope-origin';
    }
    if (!this.policy.origins.includes(url.origin)) return 'out-of-scope-origin';
    // The verification file is how ownership gets proved, so it is never excluded.
    if (url.pathname !== VERIFICATION_PATH && isExcludedPath(this.policy, url.pathname)) {
      return 'excluded-path';
    }
    if (!this.policy.allowedTests.includes(request.testType)) return 'test-not-allowed';
    if (isOffensive(request.testType) && !this.verified) return 'not-verified';
    const now = this.now();
    while (this.sent.length > 0 && (this.sent[0] ?? 0) <= now - WINDOW_MS) this.sent.shift();
    if (this.sent.length >= this.policy.maxRequestsPerSecond) return 'rate-limited';
    return null;
  }
}
