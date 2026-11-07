import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Endpoint } from '../../domain/surface/endpoint.js';
import { describeAttackSurfaceContract } from '../../test-support/attack-surface-contract.js';
import { loadSurfaceConfig, repoSurfaceConfigPath, surfaceTargetSchema } from './surface-config.js';
import { TypeScriptAttackSurface } from './typescript-attack-surface.js';

const fixtures = fileURLToPath(new URL('../../../fixtures/surface/', import.meta.url));
const workspace = (name: string) => ({
  id: name,
  path: `${fixtures}${name}`,
  url: `file:///${name}`,
  baseSha: '',
});
const NEXTJS = surfaceTargetSchema.parse({ framework: 'nextjs', authCalls: ['requireUser'] });
const EXPRESS = surfaceTargetSchema.parse({
  framework: 'express',
  files: ['server.ts'],
  authMiddleware: ['security.isAuthorized'],
  sessionCalls: ['security.authenticatedUsers.from', 'security.authenticatedUsers.get'],
  sessionIds: ['req.body.UserId'],
  ignoreCalls: ['challengeUtils.solveIf'],
});

describeAttackSurfaceContract('TypeScriptAttackSurface on a Next.js sample', {
  create: () =>
    Promise.resolve({
      surface: new TypeScriptAttackSurface(NEXTJS),
      workspace: workspace('nextjs'),
    }),
  expected: [{ route: '/api/orders/:id', method: 'GET' }],
});

describeAttackSurfaceContract('TypeScriptAttackSurface on an Express sample', {
  create: () =>
    Promise.resolve({
      surface: new TypeScriptAttackSurface(EXPRESS),
      workspace: workspace('express'),
    }),
  expected: [
    { route: '/rest/basket/:id', method: 'GET' },
    { route: '/rest/order-history', method: 'GET' },
    { route: '/rest/products/search', method: 'GET' },
  ],
});

const checks = (endpoints: Endpoint[]) =>
  Object.fromEntries(
    endpoints.map((endpoint) => [
      `${endpoint.method} ${endpoint.route}`,
      { auth: endpoint.auth, ownerCheck: endpoint.ownerCheck },
    ]),
  );

describe('auth and owner checks', () => {
  it('Next.js: a session call makes auth; the session user reaching the query makes the owner check', async () => {
    const endpoints = await new TypeScriptAttackSurface(NEXTJS).map(workspace('nextjs'));

    expect(checks(endpoints)).toEqual({
      'GET /api/orders/:id': { auth: true, ownerCheck: true },
      'GET /api/invoices/:id': { auth: true, ownerCheck: false },
      'GET /api/products': { auth: false, ownerCheck: 'unknown' },
    });
  });

  it('Express: middlewares and earlier mounts make auth; challenge bookkeeping is no owner check', async () => {
    const endpoints = await new TypeScriptAttackSurface(EXPRESS).map(workspace('express'));

    expect(checks(endpoints)).toEqual({
      // Covered by app.use('/rest/basket/:id', isAuthorized()); reads any basket by id.
      'GET /rest/basket/:id': { auth: true, ownerCheck: false },
      // No middleware: the handler reads the session and refuses without one; the orders are
      // filtered by a value computed from the session user's email.
      'GET /rest/order-history': { auth: true, ownerCheck: true },
      'GET /rest/products/search': { auth: false, ownerCheck: 'unknown' },
      // Only a guard in front of generated routes: no handler of its own to judge.
      'POST /api/Products': { auth: true, ownerCheck: 'unknown' },
      // Its mount comes after it, so Express never applies it.
      'GET /rest/late': { auth: false, ownerCheck: 'unknown' },
    });
    expect(endpoints.find((endpoint) => endpoint.route === '/api/Products')?.handler).toBeNull();
  });
});

describe('config/surface.yaml', () => {
  it('declares ShopLab as Next.js and pins Juice Shop with its route files and auth rules', async () => {
    const targets = await loadSurfaceConfig(repoSurfaceConfigPath());

    expect(targets.shoplab).toMatchObject({ framework: 'nextjs', authCalls: ['requireUser'] });
    expect(targets['juice-shop']).toMatchObject({
      framework: 'express',
      ref: 'v20.3.0',
      files: ['server.ts'],
      sessionIds: ['req.body.UserId'],
    });
    expect(targets['juice-shop']?.authMiddleware).toContain('security.isAuthorized');
  });
});
