import { describe, expect, it } from 'vitest';

import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedRequest } from '../../domain/scope/scoped-http-port.js';
import { VerifiedScope } from '../../domain/scope/verified-scope.js';
import { InMemoryScopedHttp } from '../../infrastructure/scope/in-memory-scoped-http.js';
import { asSession } from './session-client.js';
import { race } from './race.js';

const ORIGIN = 'http://janus-juice-shop-app:3000';
const TOKEN = 'janus-verify-01JC0F28CNS0000000000000AA';
const policy = (maxRequestsPerSecond: number): ScopePolicy => ({
  target: 'juice-shop',
  origins: [ORIGIN],
  excludedPaths: [],
  allowedTests: ['race', 'idor'],
  maxRequestsPerSecond,
});
const verified = (rate: number) =>
  VerifiedScope.verify(policy(rate), TOKEN, new Map([[ORIGIN, TOKEN]]), 'now');

// A like that only checks for a duplicate before a slow write: the first two get through.
function likes() {
  let accepted = 0;
  return new InMemoryScopedHttp(() => {
    accepted += 1;
    return accepted <= 2
      ? { status: 200, headers: {}, body: `{"likes":${String(accepted)}}` }
      : { status: 403, headers: {}, body: '{"error":"Not allowed"}' };
  });
}

const like: ScopedRequest = {
  method: 'POST',
  url: `${ORIGIN}/rest/products/reviews`,
  testType: 'race',
};

describe('race', () => {
  it('fires n requests at once and aggregates statuses and bodies', async () => {
    const http = likes();
    const client = http.client(new NetworkGuard(verified(20)), () => Promise.resolve());

    const result = await race(client, like, 5);

    expect(http.sent).toHaveLength(5);
    expect(result).toMatchObject({
      sent: 5,
      blocked: 0,
      failed: 0,
      statuses: { 200: 2, 403: 3 },
      distinctBodies: 3,
    });
  });

  it('never outruns the scope’s rate: the rest are blocked', async () => {
    const http = likes();
    const client = http.client(new NetworkGuard(verified(3), () => 0), () => Promise.resolve());

    const result = await race(client, like, 5);

    expect(result.blocked).toBe(2);
    expect(http.sent).toHaveLength(3);
  });

  it('sends every request as the race test type, so an unverified scope blocks them all', async () => {
    const http = likes();
    const client = http.client(new NetworkGuard(policy(20)), () => Promise.resolve());

    expect((await race(client, { ...like, testType: 'idor' }, 3)).blocked).toBe(3);
  });

  it('refuses a race of one or of more than the cap', async () => {
    const client = likes().client(new NetworkGuard(verified(20)), () => Promise.resolve());

    await expect(race(client, like, 1)).rejects.toThrow(RangeError);
    await expect(race(client, like, 51)).rejects.toThrow(RangeError);
  });

  it('carries the session in every request', async () => {
    const http = likes();
    const client = asSession(
      http.client(new NetworkGuard(verified(20)), () => Promise.resolve()),
      {
        user: { label: 'b', email: 'b@janus.test', password: 'x', userId: 2 },
        token: 'jwt-b',
        basketId: 2,
      },
    );

    await race(client, like, 2);

    expect(http.sent.map((request) => request.headers?.authorization)).toEqual([
      'Bearer jwt-b',
      'Bearer jwt-b',
    ]);
  });
});
