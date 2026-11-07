import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { describeAttackSurfaceContract } from '../../test-support/attack-surface-contract.js';
import { loadSurfaceConfig, repoSurfaceConfigPath } from './surface-config.js';
import { TypeScriptAttackSurface } from './typescript-attack-surface.js';

const fixtures = fileURLToPath(new URL('../../../fixtures/surface/', import.meta.url));
const workspace = (name: string) => ({
  id: name,
  path: `${fixtures}${name}`,
  url: `file:///${name}`,
  baseSha: '',
});

describeAttackSurfaceContract('TypeScriptAttackSurface on a Next.js sample', {
  create: () =>
    Promise.resolve({
      surface: new TypeScriptAttackSurface({ framework: 'nextjs', files: [] }),
      workspace: workspace('nextjs'),
    }),
  expected: [{ route: '/api/orders/:id', method: 'GET' }],
});

describeAttackSurfaceContract('TypeScriptAttackSurface on an Express sample', {
  create: () =>
    Promise.resolve({
      surface: new TypeScriptAttackSurface({ framework: 'express', files: ['server.ts'] }),
      workspace: workspace('express'),
    }),
  expected: [
    { route: '/rest/basket/:id', method: 'GET' },
    { route: '/rest/order-history', method: 'GET' },
    { route: '/rest/products/search', method: 'GET' },
  ],
});

describe('config/surface.yaml', () => {
  it('declares ShopLab as Next.js and pins Juice Shop with its route files', async () => {
    const targets = await loadSurfaceConfig(repoSurfaceConfigPath());

    expect(targets.shoplab).toMatchObject({ framework: 'nextjs' });
    expect(targets['juice-shop']).toMatchObject({
      framework: 'express',
      ref: 'v20.3.0',
      files: ['server.ts'],
    });
  });
});
