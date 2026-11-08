import { describe, expect, it } from 'vitest';

import {
  canonicalPath,
  createScopePolicy,
  InvalidScopePolicyError,
  isExcludedPath,
  type ScopePolicy,
} from './scope-policy.js';

const juiceShop: ScopePolicy = {
  target: 'juice-shop',
  origins: ['http://janus-juice-shop-app:3000'],
  excludedPaths: ['/api/Challenges', '/rest/continue-code*', '/snippets/**'],
  allowedTests: ['http-probe', 'idor'],
  maxRequestsPerSecond: 20,
};

describe('createScopePolicy', () => {
  it('accepts a policy with plain origins and readable patterns', () => {
    expect(createScopePolicy(juiceShop)).toEqual(juiceShop);
  });

  it.each([
    [{ origins: [] }, 'allows no origin'],
    [{ origins: ['http://*.example.test'] }, 'Not an'],
    [{ origins: ['http://shop.test/path'] }, 'without path'],
    [{ origins: ['ftp://shop.test'] }, 'without path'],
    [{ excludedPaths: ['api/x'] }, 'Bad excluded path'],
    [{ excludedPaths: ['/a/*/b'] }, 'Bad excluded path'],
    [{ allowedTests: ['ddos'] }, 'Unknown test'],
    [{ maxRequestsPerSecond: 0 }, 'maxRequestsPerSecond'],
  ])('refuses %j', (override, message) => {
    expect(() => createScopePolicy({ ...juiceShop, ...override } as ScopePolicy)).toThrow(
      InvalidScopePolicyError,
    );
    expect(() => createScopePolicy({ ...juiceShop, ...override } as ScopePolicy)).toThrow(message);
  });
});

describe('isExcludedPath', () => {
  it.each([
    '/api/Challenges',
    '/API/challenges/',
    '/api//Challenges',
    '/api/x/../Challenges',
    '/api/%43hallenges',
    '/rest/continue-code',
    '/rest/continue-code-findIt',
    '/snippets',
    '/snippets/loginAdminChallenge',
  ])('excludes %s', (path) => {
    expect(isExcludedPath(juiceShop, path)).toBe(true);
  });

  it.each(['/api/Challengesx', '/api/Products', '/rest/basket/1', '/snippetsx', '/'])(
    'keeps %s in scope',
    (path) => {
      expect(isExcludedPath(juiceShop, path)).toBe(false);
    },
  );
});

describe('canonicalPath', () => {
  it('cannot climb above the root', () => {
    expect(canonicalPath('/../../etc/passwd')).toBe('/etc/passwd');
  });
});
