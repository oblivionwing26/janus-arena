import { describe, expect, it } from 'vitest';

import { AttemptLimits } from './attempt-limits.js';

const routes = [
  { method: 'GET', route: '/rest/basket/:id' },
  { method: 'POST', route: '/rest/user/login' },
  { method: 'ALL', route: '/api/Products/*' },
] as const;

describe('AttemptLimits', () => {
  it('counts a concrete path against its route, whatever the id', () => {
    const limits = new AttemptLimits(routes, { perEndpoint: 2, total: 10 });

    expect(limits.admit('GET', '/rest/basket/1')).toEqual({
      admitted: true,
      endpoint: 'GET /rest/basket/:id',
    });
    expect(limits.admit('GET', '/rest/basket/2?x=1').admitted).toBe(true);
    expect(limits.admit('GET', '/rest/basket/3')).toEqual({
      admitted: false,
      scope: 'endpoint',
      reason: 'GET /rest/basket/:id already had its 2 attempts',
    });
    expect(limits.admit('POST', '/rest/user/login').admitted).toBe(true);
  });

  it('stops the run at its total', () => {
    const limits = new AttemptLimits(routes, { perEndpoint: 5, total: 2 });

    limits.admit('POST', '/rest/user/login');
    limits.admit('GET', '/rest/basket/1');
    expect(limits.admit('GET', '/rest/basket/1')).toEqual({
      admitted: false,
      scope: 'run',
      reason: "the run's 2 attempts are used up",
    });
  });

  it('treats a path the map does not know as its own endpoint', () => {
    const limits = new AttemptLimits(routes);

    expect(limits.endpointOf('GET', '/secret/thing')).toBe('GET /secret/thing');
    expect(limits.endpointOf('GET', '/rest/basket')).toBe('GET /rest/basket');
    expect(limits.endpointOf('DELETE', '/api/Products/7')).toBe('DELETE /api/Products/*');
  });
});
