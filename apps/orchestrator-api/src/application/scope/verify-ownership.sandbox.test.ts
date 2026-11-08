// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and the agent browser from
// docker-compose.yml. F3.1 "Done when" on the real Juice Shop image.

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
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { recordBlocked, VerifyOwnership } from './verify-ownership.js';

const VARIANT = 'scope-test';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const store = new InMemoryEventStore();
const runId = newUlid();
let policy: ScopePolicy;

beforeAll(async () => {
  await sandbox.down(VARIANT);
  const { baseUrl } = await sandbox.up({ id: VARIANT, target: 'juice-shop', ref: 'image' });
  policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), 'juice-shop', [
    new URL(baseUrl).origin,
  ]);
});

afterAll(async () => {
  await http.close();
  await sandbox.down(VARIANT);
});

describe('F3.1 done when (Juice Shop)', () => {
  it('blocks an offensive request until ownership is verified, then lets it through', async () => {
    const origin = policy.origins[0] ?? '';
    const blocked: string[] = [];
    const unverified = http.client(new NetworkGuard(policy), (each) => {
      blocked.push(each.reason);
      return Promise.resolve();
    });
    await expect(
      unverified.send({ method: 'GET', url: `${origin}/rest/basket/1`, testType: 'idor' }),
    ).rejects.toThrow(ScopeBlockedError);
    expect(blocked).toEqual(['not-verified']);

    const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
      runId,
      variantId: VARIANT,
      policy,
    });
    const verified = http.client(new NetworkGuard(scope), () => Promise.resolve());
    // Reached from inside janus-sbx: Juice Shop answers (401 without a session).
    const basket = await verified.send({
      method: 'GET',
      url: `${origin}/rest/basket/1`,
      testType: 'idor',
    });
    expect(basket.status).toBe(401);
    expect((await store.readRun(runId)).filter(isKnownEvent).map((event) => event.type)).toContain(
      'scope.verified',
    );
  });

  it('never lets anyone read Juice Shop ground truth, verified or not', async () => {
    const origin = policy.origins[0] ?? '';
    const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
      runId,
      variantId: VARIANT,
      policy,
    });
    const client = http.client(
      new NetworkGuard(scope),
      recordBlocked(new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR)),
    );

    for (const path of ['/api/Challenges', '/API/challenges', '/snippets/loginAdminChallenge']) {
      await expect(
        client.send({ method: 'GET', url: `${origin}${path}`, testType: 'http-probe' }),
      ).rejects.toThrow(ScopeBlockedError);
    }
    await expect(
      client.send({ method: 'GET', url: 'http://example.com/', testType: 'http-probe' }),
    ).rejects.toThrow(ScopeBlockedError);
    const reasons = (await store.readRun(runId))
      .filter(isKnownEvent)
      .flatMap((event) => (event.type === 'scope.blocked' ? [event.payload.reason] : []));
    expect(reasons).toEqual([
      'excluded-path',
      'excluded-path',
      'excluded-path',
      'out-of-scope-origin',
    ]);
  });

  it('refuses a stale token: verification needs this run’s token in the container', async () => {
    await expect(
      new VerifyOwnership({
        tokens: { place: () => Promise.resolve() },
        http,
        store,
      }).execute({ runId, variantId: VARIANT, policy }),
    ).rejects.toThrow('different verification token');
  });
});
