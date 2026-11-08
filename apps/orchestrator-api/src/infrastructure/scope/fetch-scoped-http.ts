import { setTimeout as sleep } from 'node:timers/promises';

import {
  ScopeBlockedError,
  type BlockedRequest,
  type NetworkGuard,
} from '../../domain/scope/network-guard.js';
import type {
  ScopedHttpClient,
  ScopedHttpPort,
  ScopedReply,
  ScopedRequest,
} from '../../domain/scope/scoped-http-port.js';

const MAX_BODY = 1_000_000;
const TIMEOUT_MS = 10_000;

const MAX_PACING_MS = 2_000;

/**
 * Guards a request, reporting and throwing when it is blocked. Shared by the adapters. A
 * request that only has to wait for the rate waits (up to 2 s) instead of failing; a race
 * request never waits, so a race stays a race and its overflow is blocked.
 */
export async function guard(
  networkGuard: NetworkGuard,
  onBlocked: (blocked: BlockedRequest) => Promise<void>,
  request: ScopedRequest,
): Promise<void> {
  if (request.testType !== 'race') {
    const wait = networkGuard.waitMs();
    if (wait > 0 && wait <= MAX_PACING_MS) await sleep(wait);
  }
  const decision = networkGuard.check(request);
  if (decision.allowed) return;
  const blocked = networkGuard.describe(request, decision.reason);
  await onBlocked(blocked);
  throw new ScopeBlockedError(blocked);
}

/**
 * The real client (F3.1): Node's fetch, redirects never followed, a bounded body and timeout.
 * The guard decides every request before it leaves.
 */
export class FetchScopedHttp implements ScopedHttpPort {
  client(
    networkGuard: NetworkGuard,
    onBlocked: (blocked: BlockedRequest) => Promise<void>,
  ): ScopedHttpClient {
    return {
      send: async (request: ScopedRequest): Promise<ScopedReply> => {
        await guard(networkGuard, onBlocked, request);
        const response = await fetch(request.url, {
          method: request.method,
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          ...(request.headers === undefined ? {} : { headers: { ...request.headers } }),
          ...(request.body === undefined ? {} : { body: request.body }),
        });
        const text = await response.text();
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: text.slice(0, MAX_BODY),
        };
      },
    };
  }
}
