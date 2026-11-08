import { describe, expect, it } from 'vitest';

import type { Endpoint } from '../surface/endpoint.js';
import { idorCandidates } from './idor-candidates.js';
import { loginBypassCandidates, SQL_LOGIN_PAYLOADS } from './login-bypass-candidates.js';

const endpoint = (over: Partial<Endpoint> & Pick<Endpoint, 'method' | 'route'>): Endpoint => ({
  declaredAt: { file: 'server.ts', line: 1 },
  handler: null,
  params: [],
  auth: true,
  ownerCheck: false,
  ...over,
});

describe('idorCandidates', () => {
  const endpoints = [
    endpoint({ method: 'GET', route: '/rest/basket/:id', ownerCheck: false }),
    endpoint({ method: 'GET', route: '/api/Users/:id', ownerCheck: 'unknown' }),
    endpoint({ method: 'GET', route: '/rest/order/:id', ownerCheck: true }), // filtered: skip
    endpoint({ method: 'POST', route: '/rest/basket/:id', ownerCheck: false }), // not a read
    endpoint({ method: 'GET', route: '/rest/products', ownerCheck: false }), // no id
    endpoint({ method: 'GET', route: '/api/a/:x/b/:y', ownerCheck: false }), // two ids
    endpoint({ method: 'GET', route: '/rest/basket/:id', auth: false }), // no session
  ];

  it('probes the attacker’s own id and its neighbours on eligible endpoints only', () => {
    const candidates = idorCandidates(endpoints, { baseId: 5, neighbours: 2 });
    const basket = candidates.filter((c) => c.path.startsWith('/rest/basket/'));

    expect(basket.map((c) => c.path)).toEqual([
      '/rest/basket/5',
      '/rest/basket/6',
      '/rest/basket/4',
      '/rest/basket/7',
      '/rest/basket/3',
    ]);
    expect(basket.every((c) => c.class === 'idor' && c.as === 'b' && c.method === 'GET')).toBe(
      true,
    );
    // Only the two eligible single-id endpoints produce candidates.
    expect(new Set(candidates.map((c) => c.path.replace(/\d+$/, ':id')))).toEqual(
      new Set(['/rest/basket/:id', '/api/Users/:id']),
    );
  });

  it('never probes an id below 1', () => {
    const basket = endpoint({ method: 'GET', route: '/rest/basket/:id', ownerCheck: false });
    const paths = idorCandidates([basket], { baseId: 1, neighbours: 3 }).map((c) => c.path);

    expect(paths).toEqual(['/rest/basket/1', '/rest/basket/2', '/rest/basket/3', '/rest/basket/4']);
  });
});

describe('loginBypassCandidates', () => {
  it('sends each payload in the identity field of a login, as anonymous', () => {
    const candidates = loginBypassCandidates([
      // The surface map prefixes body params (`body.email`); a login has no password-repeat.
      endpoint({
        method: 'POST',
        route: '/rest/user/login',
        params: ['body.email', 'body.password'],
      }),
      endpoint({ method: 'POST', route: '/api/Feedbacks', params: ['body.comment'] }), // not a login
      endpoint({
        method: 'POST',
        route: '/api/Users',
        params: ['body.email', 'body.password', 'body.passwordRepeat'], // registration, not a login
      }),
      endpoint({
        method: 'GET',
        route: '/rest/user/login',
        params: ['body.email', 'body.password'],
      }),
    ]);

    expect(candidates).toHaveLength(SQL_LOGIN_PAYLOADS.length);
    expect(candidates.every((c) => c.class === 'auth-bypass' && c.as === 'anonymous')).toBe(true);
    const first = JSON.parse(candidates[0]?.body ?? '{}') as Record<string, string>;
    expect(first.email).toBe(SQL_LOGIN_PAYLOADS[0]);
    expect(first.password).toBe('janus-not-the-password');
    expect(candidates.every((c) => c.path === '/rest/user/login')).toBe(true);
  });

  it('uses whatever identity field the surface map reports', () => {
    const candidates = loginBypassCandidates([
      endpoint({ method: 'POST', route: '/auth', params: ['username', 'pass'] }),
    ]);
    const body = JSON.parse(candidates[0]?.body ?? '{}') as Record<string, string>;

    expect(body.username).toBe(SQL_LOGIN_PAYLOADS[0]);
    expect(body.pass).toBe('janus-not-the-password');
  });
});
