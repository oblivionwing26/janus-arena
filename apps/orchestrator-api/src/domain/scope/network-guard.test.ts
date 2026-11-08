import { describe, expect, it } from 'vitest';

import { NetworkGuard } from './network-guard.js';
import type { ScopePolicy } from './scope-policy.js';
import { VERIFICATION_PATH, VerifiedScope } from './verified-scope.js';

const ORIGIN = 'http://janus-juice-shop-app:3000';
const TOKEN = 'janus-verify-01JC0F28CNS0000000000000AA';
const policy: ScopePolicy = {
  target: 'juice-shop',
  origins: [ORIGIN],
  excludedPaths: ['/api/Challenges', '/snippets/**', '/.well-known/**'],
  allowedTests: ['http-probe', 'idor'],
  maxRequestsPerSecond: 3,
};
const verified = () => VerifiedScope.verify(policy, TOKEN, new Map([[ORIGIN, TOKEN]]), 'now');

describe('NetworkGuard', () => {
  it('blocks a host that is not in the verified scope', () => {
    const guard = new NetworkGuard(verified());

    expect(
      guard.check({ method: 'GET', url: 'http://example.com/', testType: 'http-probe' }),
    ).toEqual({ allowed: false, reason: 'out-of-scope-origin' });
    expect(
      guard.check({ method: 'GET', url: 'http://janus-juice-shop-app:3001/', testType: 'idor' }),
    ).toEqual({ allowed: false, reason: 'out-of-scope-origin' });
  });

  it('blocks an excluded path, however it is spelt', () => {
    const guard = new NetworkGuard(verified());

    for (const path of ['/api/Challenges', '/API/challenges?x=1', '/snippets/x']) {
      expect(guard.check({ method: 'GET', url: `${ORIGIN}${path}`, testType: 'idor' })).toEqual({
        allowed: false,
        reason: 'excluded-path',
      });
    }
  });

  it('never excludes the verification file itself', () => {
    const guard = new NetworkGuard(policy);

    expect(
      guard.check({ method: 'GET', url: `${ORIGIN}${VERIFICATION_PATH}`, testType: 'http-probe' }),
    ).toEqual({ allowed: true });
  });

  it('blocks tests the policy does not allow', () => {
    const guard = new NetworkGuard(verified());

    expect(guard.check({ method: 'GET', url: `${ORIGIN}/`, testType: 'xss' })).toEqual({
      allowed: false,
      reason: 'test-not-allowed',
    });
  });

  it('lets an unverified scope probe and browse, never attack', () => {
    const guard = new NetworkGuard(policy);

    expect(guard.check({ method: 'GET', url: `${ORIGIN}/`, testType: 'http-probe' })).toEqual({
      allowed: true,
    });
    expect(
      guard.check({ method: 'GET', url: `${ORIGIN}/rest/basket/1`, testType: 'idor' }),
    ).toEqual({ allowed: false, reason: 'not-verified' });
  });

  it('holds the rate to the policy within any one second', () => {
    let now = 10_000;
    const guard = new NetworkGuard(verified(), () => now);
    const probe = () => guard.check({ method: 'GET', url: `${ORIGIN}/`, testType: 'idor' });

    expect([probe(), probe(), probe()].every((decision) => decision.allowed)).toBe(true);
    expect(probe()).toEqual({ allowed: false, reason: 'rate-limited' });
    now += 1_000;
    expect(probe()).toEqual({ allowed: true });
  });

  it('says how long until the next request fits the rate', () => {
    let now = 10_000;
    const guard = new NetworkGuard(verified(), () => now);
    const probe = () => guard.check({ method: 'GET', url: `${ORIGIN}/`, testType: 'idor' });

    expect(guard.waitMs()).toBe(0);
    probe();
    now += 200;
    probe();
    probe();
    expect(guard.waitMs()).toBe(800);
    now += 800;
    expect(guard.waitMs()).toBe(0);
  });

  it('describes a blocked request without its query string', () => {
    const guard = new NetworkGuard(policy);

    expect(
      guard.describe(
        { method: 'post', url: `${ORIGIN}/api/Challenges?token=secret`, testType: 'idor' },
        'excluded-path',
      ),
    ).toEqual({
      method: 'POST',
      origin: ORIGIN,
      path: '/api/Challenges',
      testType: 'idor',
      reason: 'excluded-path',
    });
  });

  it('gives SynthLab a browse-only guard for the variant', () => {
    const guard = NetworkGuard.forOrigin('shoplab', 'http://janus-a-app:3000/cart');

    expect(
      guard.check({ method: 'GET', url: 'http://janus-a-app:3000/x', testType: 'browse' }),
    ).toEqual({ allowed: true });
    expect(
      guard.check({ method: 'GET', url: 'https://fonts.example.com/x', testType: 'browse' }),
    ).toEqual({ allowed: false, reason: 'out-of-scope-origin' });
  });
});
