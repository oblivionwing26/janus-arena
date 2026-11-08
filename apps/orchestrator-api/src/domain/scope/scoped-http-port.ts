import type { BlockedRequest, NetworkGuard } from './network-guard.js';
import type { TestType } from './test-type.js';

export interface ScopedRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly testType: TestType;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface ScopedReply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** At most 1 MB of the body, as text. */
  readonly body: string;
}

/** An HTTP client whose every request, and every redirect hop, passes the network guard. */
export interface ScopedHttpClient {
  /**
   * Sends the request when the guard allows it. Otherwise calls `onBlocked` and throws
   * ScopeBlockedError. Redirects are never followed: a 3xx comes back as it is.
   */
  send(request: ScopedRequest): Promise<ScopedReply>;
}

/**
 * Makes HTTP clients bound to a guard (F3.1). Every adapter must pass
 * src/test-support/scoped-http-contract.ts.
 */
export interface ScopedHttpPort {
  client(
    guard: NetworkGuard,
    onBlocked: (blocked: BlockedRequest) => Promise<void>,
  ): ScopedHttpClient;
}

export const SCOPED_HTTP_PORT = Symbol('ScopedHttpPort');
