import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { SandboxNotFoundError } from '../../domain/sandbox/sandbox-errors.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedReply, ScopedRequest } from '../../domain/scope/scoped-http-port.js';
import { OwnershipNotVerifiedError, VERIFICATION_PATH } from '../../domain/scope/verified-scope.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryOwnershipTokens } from '../../infrastructure/scope/in-memory-ownership-tokens.js';
import { InMemoryScopedHttp } from '../../infrastructure/scope/in-memory-scoped-http.js';
import { VerifyOwnership } from './verify-ownership.js';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const ORIGIN = 'http://janus-juice-shop-app:3000';
const policy: ScopePolicy = {
  target: 'juice-shop',
  origins: [ORIGIN],
  excludedPaths: ['/api/Challenges', '/.well-known/**'],
  allowedTests: ['http-probe', 'idor'],
  maxRequestsPerSecond: 20,
};

type Serve = (tokens: InMemoryOwnershipTokens, request: ScopedRequest) => ScopedReply;

function harness(serve: Serve) {
  const tokens = new InMemoryOwnershipTokens(new Set(['juice-shop']));
  const http = new InMemoryScopedHttp((request) => serve(tokens, request));
  const store = new InMemoryEventStore();
  const verify = new VerifyOwnership({
    tokens,
    http,
    store,
    now: () => new Date('2026-11-08T00:00:00Z'),
  });
  return { tokens, http, store, verify };
}

const servesToken: Serve = (tokens, request) =>
  new URL(request.url).pathname === VERIFICATION_PATH
    ? { status: 200, headers: {}, body: `${tokens.tokens.get('juice-shop') ?? ''}\n` }
    : { status: 404, headers: {}, body: '' };

describe('VerifyOwnership', () => {
  it('places a fresh token, reads it back through the guard and records scope.verified', async () => {
    const { verify, store, http, tokens } = harness(servesToken);

    const scope = await verify.execute({ runId: RUN_ID, variantId: 'juice-shop', policy });

    const token = tokens.tokens.get('juice-shop') ?? '';
    expect(scope.verifiedAt).toBe('2026-11-08T00:00:00.000Z');
    expect(token).toMatch(/^janus-verify-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(http.sent.map((request) => [request.url, request.testType])).toEqual([
      [`${ORIGIN}${VERIFICATION_PATH}`, 'http-probe'],
    ]);
    const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
    expect(events.map((event) => event.type)).toEqual(['scope.verified']);
    expect(JSON.stringify(events)).not.toContain(token);
  });

  it('lets offensive tests through the verified scope only', async () => {
    const { verify } = harness(servesToken);
    const scope = await verify.execute({ runId: RUN_ID, variantId: 'juice-shop', policy });
    const attack = { method: 'GET', url: `${ORIGIN}/rest/basket/2`, testType: 'idor' } as const;

    expect(new NetworkGuard(policy).check(attack)).toEqual({
      allowed: false,
      reason: 'not-verified',
    });
    expect(new NetworkGuard(scope).check(attack)).toEqual({ allowed: true });
  });

  it.each<[string, Serve]>([
    ['a 404', () => ({ status: 404, headers: {}, body: '' })],
    ['a redirect', () => ({ status: 302, headers: { location: 'http://example.com/' }, body: '' })],
    [
      'another token',
      () => ({ status: 200, headers: {}, body: 'janus-verify-not-the-one-we-placed' }),
    ],
  ])('refuses %s and records nothing', async (_case, serve) => {
    const { verify, store } = harness(serve);

    await expect(
      verify.execute({ runId: RUN_ID, variantId: 'juice-shop', policy }),
    ).rejects.toThrow(OwnershipNotVerifiedError);
    expect(await store.readRun(RUN_ID)).toEqual([]);
  });

  it('fails when the variant is not up', async () => {
    const { verify } = harness(servesToken);

    await expect(verify.execute({ runId: RUN_ID, variantId: 'other', policy })).rejects.toThrow(
      SandboxNotFoundError,
    );
  });
});
