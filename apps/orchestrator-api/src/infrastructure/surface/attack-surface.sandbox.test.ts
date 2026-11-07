// F2.6 "Done when", local only (`pnpm test:sandbox`; needs network to clone, no API spend).
// ShopLab has no seeded security flaws (ADR 0006), so the IDOR is checked on OWASP Juice Shop:
// `GET /rest/basket/:id` demands a session but reads any basket by its id ("View Basket").
// ShopLab's `GET /api/orders/:id` is the control: it filters by the session user.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Endpoint } from '../../domain/surface/endpoint.js';
import { describeAttackSurfaceContract } from '../../test-support/attack-surface-contract.js';
import { loadSandboxDefinition } from '../sandbox/sandbox-definition.js';
import { workspacesRoot } from '../sandbox/workspace.js';
import { LocalGitAdapter } from '../vcs/local-git-adapter.js';
import { loadSurfaceConfig, repoSurfaceConfigPath, type SurfaceTarget } from './surface-config.js';
import { TypeScriptAttackSurface } from './typescript-attack-surface.js';

const MINUTES = 60_000;
const runIds: string[] = [];
const endpoints = new Map<string, Endpoint[]>();
let targets: Record<string, SurfaceTarget> = {};

async function map(name: string): Promise<Endpoint[]> {
  const target = targets[name];
  if (target === undefined) throw new Error(`no surface config for ${name}`);
  const repo = target.repo ?? (await loadSandboxDefinition(name)).repo;
  const runId = newUlid();
  runIds.push(runId);
  const workspace = await new LocalGitAdapter().clone(repo, {
    runId,
    ref: target.ref ?? 'main',
    depth: 1,
  });
  return new TypeScriptAttackSurface(target).map(workspace);
}

beforeAll(async () => {
  targets = await loadSurfaceConfig(repoSurfaceConfigPath());
  endpoints.set('juice-shop', await map('juice-shop'));
  endpoints.set('shoplab', await map('shoplab'));
}, 10 * MINUTES);

afterAll(async () => {
  for (const runId of runIds)
    await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
});

const find = (target: string, method: string, route: string) =>
  endpoints.get(target)?.find((endpoint) => endpoint.method === method && endpoint.route === route);

describe('F2.6 done when: the IDOR is on the map', () => {
  it('Juice Shop: GET /rest/basket/:id demands a session but checks no owner', () => {
    expect(find('juice-shop', 'GET', '/rest/basket/:id')).toMatchObject({
      auth: true,
      ownerCheck: false,
      params: ['id'],
      handler: { file: 'routes/basket.ts' },
    });
  });

  it('ShopLab control: GET /api/orders/:id demands a session and filters by its user', () => {
    expect(find('shoplab', 'GET', '/api/orders/:id')).toMatchObject({
      auth: true,
      ownerCheck: true,
      params: ['id'],
    });
  });
});

describeAttackSurfaceContract(
  'TypeScriptAttackSurface on Juice Shop v20.3.0',
  {
    create: () =>
      Promise.resolve({
        surface: { map: () => Promise.resolve(endpoints.get('juice-shop') ?? []) },
        workspace: { id: 'juice-shop', path: '', url: '', baseSha: '' },
      }),
    expected: [
      { route: '/rest/basket/:id', method: 'GET' },
      { route: '/rest/order-history', method: 'GET' },
    ],
  },
  MINUTES,
);
