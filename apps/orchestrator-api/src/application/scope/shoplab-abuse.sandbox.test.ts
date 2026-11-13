// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and the agent browser from
// docker-compose.yml. F4.1a "Done when" on the real ShopLab image: it proves its ownership like
// Juice Shop does, may be loaded but not exploited (ADR 0020), takes the defenses a variant asks
// for, and tells simulated visitors apart by the address they present.
//
// SHOPLAB_REF picks the ShopLab branch to build (main by default).

import { isKnownEvent, newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NetworkGuard, ScopeBlockedError } from '../../domain/scope/network-guard.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import {
  loadScopeConfig,
  repoScopeConfigPath,
  scopePolicyFor,
} from '../../infrastructure/scope/scope-config.js';
import { VerifyOwnership } from './verify-ownership.js';

const VARIANT = 'abuse-test-b';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const store = new InMemoryEventStore();
const runId = newUlid();
let policy: ScopePolicy;

beforeAll(async () => {
  await sandbox.down(VARIANT);
  const { baseUrl } = await sandbox.up({
    id: VARIANT,
    target: 'shoplab',
    ref: process.env.SHOPLAB_REF ?? 'main',
    env: { SHOPLAB_RATE_LIMIT_IP: '6/60', SHOPLAB_TRUST_FORWARDED_FOR: '1' },
  });
  policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), 'shoplab', [
    new URL(baseUrl).origin,
  ]);
}, 600_000);

afterAll(async () => {
  await http.close();
  await sandbox.down(VARIANT);
});

describe('F4.1a done when (ShopLab)', () => {
  it('blocks traffic of the abuse kind until its ownership is verified, and exploits always', async () => {
    const origin = policy.origins[0] ?? '';
    const reasons: string[] = [];
    const client = http.client(new NetworkGuard(policy), (each) => {
      reasons.push(each.reason);
      return Promise.resolve();
    });

    await expect(
      client.send({ method: 'POST', url: `${origin}/api/auth/logout`, testType: 'saturation' }),
    ).rejects.toThrow(ScopeBlockedError);

    const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
      runId,
      variantId: VARIANT,
      policy,
    });
    const verified = http.client(new NetworkGuard(scope), (each) => {
      reasons.push(each.reason);
      return Promise.resolve();
    });
    await expect(
      verified.send({ method: 'GET', url: `${origin}/api/orders/1`, testType: 'idor' }),
    ).rejects.toThrow(ScopeBlockedError);

    expect(reasons).toEqual(['not-verified', 'test-not-allowed']);
    expect((await store.readRun(runId)).filter(isKnownEvent).map((event) => event.type)).toContain(
      'scope.verified',
    );
  });

  it('refuses a client after its share of requests, and not another one, as the variant asked', async () => {
    const origin = policy.origins[0] ?? '';
    const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
      runId,
      variantId: VARIANT,
      policy,
    });
    const client = http.client(new NetworkGuard(scope), () => Promise.resolve());
    const logout = (from: string) =>
      client.send({
        method: 'POST',
        url: `${origin}/api/auth/logout`,
        testType: 'saturation',
        headers: { 'x-forwarded-for': from },
      });

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await logout('10.50.0.1')).status);
    const other = await logout('10.50.0.2');

    expect(statuses.filter((status) => status === 200)).toHaveLength(6);
    expect(statuses.slice(6)).toEqual([429, 429]);
    expect(other.status).toBe(200);
  });
});
