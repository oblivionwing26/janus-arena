// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and the agent browser from
// docker-compose.yml. F3.3a "Done when" (ADR 0011): the deterministic engine, driven only by
// the real Juice Shop surface map, finds the basket IDOR and the login bypass, each confirmed by
// its oracle, and calls no LLM.

import { isKnownEvent, newUlid } from '@janus/shared-kernel';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { ScriptedGateway } from '../../test-support/scripted-gateway.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import {
  loadScopeConfig,
  repoScopeConfigPath,
  scopePolicyFor,
} from '../../infrastructure/scope/scope-config.js';
import {
  loadSurfaceConfig,
  repoSurfaceConfigPath,
} from '../../infrastructure/surface/surface-config.js';
import { TypeScriptAttackSurface } from '../../infrastructure/surface/typescript-attack-surface.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { VerifyOwnership } from '../scope/verify-ownership.js';
import { RunRedTeam } from './run-red-team.js';

const VARIANT = 'red-team-test';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const store = new InMemoryEventStore();
const runId = newUlid();
let origin = '';
let endpoints: Endpoint[] = [];

beforeAll(async () => {
  const surface = (await loadSurfaceConfig(repoSurfaceConfigPath()))['juice-shop'];
  if (surface?.repo === undefined) throw new Error('no juice-shop surface config');
  const clone = await new LocalGitAdapter().clone(surface.repo, {
    runId,
    ref: surface.ref ?? 'main',
    depth: 1,
  });
  try {
    endpoints = await new TypeScriptAttackSurface(surface).map(clone);
  } finally {
    await rm(clone.path, { recursive: true, force: true });
  }

  await sandbox.down(VARIANT);
  const { baseUrl } = await sandbox.up({ id: VARIANT, target: 'juice-shop', ref: 'image' });
  origin = new URL(baseUrl).origin;
}, 10 * 60_000);

afterAll(async () => {
  await http.close();
  await sandbox.down(VARIANT);
});

describe('F3.3a done when: deterministic Red Team on Juice Shop', () => {
  it('finds the basket IDOR and the login bypass with no LLM call', async () => {
    const policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), 'juice-shop', [
      origin,
    ]);
    const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
      runId,
      variantId: VARIANT,
      policy,
    });

    const result = await new RunRedTeam({
      gateway: new ScriptedGateway([]),
      store,
      http,
      target: (client, at) => ({
        users: new JuiceShopTestUsers(client, at),
        victim: new JuiceShopVictimData(client, at),
      }),
    }).execute({
      runId,
      scope,
      origin,
      classes: ['idor', 'auth-bypass'],
      endpoints,
      findings: [],
      budget: new Budget({ maxTokens: 2_000_000, maxEur: 0.4 }),
    });

    expect(result.engine).toBe('deterministic');
    expect(result.findings.map((finding) => finding.testType).sort()).toEqual([
      'auth-bypass',
      'idor',
    ]);
    expect(result.findings.find((f) => f.testType === 'idor')?.endpoint).toBe(
      'GET /rest/basket/:id',
    );
    // The deterministic engine never calls the model.
    expect((await store.readRun(runId)).filter(isKnownEvent).map((e) => e.type)).not.toContain(
      'llm.call',
    );
  }, 120_000);
});
