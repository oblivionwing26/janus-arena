import { describe, expect, it } from 'vitest';

import type { ScopePolicy } from './scope-policy.js';
import { OwnershipNotVerifiedError, VerifiedScope } from './verified-scope.js';

const A = 'http://janus-a-app:3000';
const B = 'http://janus-b-app:3000';
const TOKEN = 'janus-verify-01JC0F28CNS0000000000000AA';
const policy: ScopePolicy = {
  target: 'juice-shop',
  origins: [A, B],
  excludedPaths: [],
  allowedTests: ['idor'],
  maxRequestsPerSecond: 5,
};

describe('VerifiedScope.verify', () => {
  it('verifies when every origin serves the token', () => {
    const scope = VerifiedScope.verify(
      policy,
      TOKEN,
      new Map([
        [A, `${TOKEN}\n`],
        [B, TOKEN],
      ]),
      '2026-11-08T00:00:00.000Z',
    );

    expect(scope.policy).toBe(policy);
    expect(scope.verifiedAt).toBe('2026-11-08T00:00:00.000Z');
  });

  it.each([
    ['one origin missing', new Map([[A, TOKEN]]), 'does not serve'],
    [
      'a 404',
      new Map<string, string | null>([
        [A, TOKEN],
        [B, null],
      ]),
      'does not serve',
    ],
    [
      'another token',
      new Map([
        [A, TOKEN],
        [B, 'janus-verify-someone-else-entirely'],
      ]),
      'different verification token',
    ],
  ])('refuses %s', (_case, served, message) => {
    expect(() => VerifiedScope.verify(policy, TOKEN, served, 'now')).toThrow(
      OwnershipNotVerifiedError,
    );
    expect(() => VerifiedScope.verify(policy, TOKEN, served, 'now')).toThrow(message);
  });

  it('refuses a token short enough to guess', () => {
    expect(() =>
      VerifiedScope.verify(
        policy,
        'x',
        new Map([
          [A, 'x'],
          [B, 'x'],
        ]),
        'now',
      ),
    ).toThrow('too short');
  });
});
