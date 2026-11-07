// Shared contract suite for AttackSurfacePort: the TypeScript adapter on the sample projects in
// `pnpm test`, and on ShopLab and Juice Shop in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import type { AttackSurfacePort } from '../domain/surface/attack-surface-port.js';
import type { Endpoint } from '../domain/surface/endpoint.js';
import type { VcsWorkspace } from '../domain/vcs/vcs-port.js';

export interface AttackSurfaceHarness {
  readonly create: () => Promise<{ surface: AttackSurfacePort; workspace: VcsWorkspace }>;
  /** Endpoints the target is known to have (route and method). */
  readonly expected: readonly Pick<Endpoint, 'route' | 'method'>[];
}

export function describeAttackSurfaceContract(
  name: string,
  harness: AttackSurfaceHarness,
  timeout = 5_000,
): void {
  describe(`AttackSurfacePort contract: ${name}`, () => {
    it(
      'lists the known endpoints, each with where it is declared and its route parameters',
      async () => {
        const { surface, workspace } = await harness.create();

        const endpoints = await surface.map(workspace);

        for (const known of harness.expected) {
          expect(endpoints).toContainEqual(expect.objectContaining(known));
        }
        for (const endpoint of endpoints) {
          expect(endpoint.route).toMatch(/^(\/|action:)/);
          expect(endpoint.declaredAt.file).not.toMatch(/^\/|^[A-Za-z]:|\.\./);
          expect(endpoint.declaredAt.line).toBeGreaterThan(0);
          for (const [, param] of endpoint.route.matchAll(/[:*](\w+)/g)) {
            expect(endpoint.params).toContain(param);
          }
        }
      },
      timeout,
    );
  });
}
