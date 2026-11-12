// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and the agent browser from
// docker-compose.yml. F3.3 "Done when" (ADR 0011): the deterministic engine, driven only by the
// real Juice Shop surface map and what its browser finds, confirms the basket IDOR, the login
// bypass, the search XSS and the negative order (plus the raced like), each by its oracle and
// each agreeing with the challenge Juice Shop itself marks as solved; and it calls no LLM.

import { isKnownEvent, newUlid } from '@janus/shared-kernel';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { JuiceShopChallenges } from '../../infrastructure/attack/juice-shop-challenges.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { JuiceShopShopperAccounts } from '../../infrastructure/personas/juice-shop-shopper-accounts.js';
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
import { describeBrowserAttackContract } from '../../test-support/browser-attack-contract.js';
import { describeShopperAccountContract } from '../../test-support/shopper-account-contract.js';
import { ScriptedGateway } from '../../test-support/scripted-gateway.js';
import { VerifyOwnership } from '../scope/verify-ownership.js';
import { RunRedTeam } from './run-red-team.js';

const VARIANT = 'red-team-test';
const CHALLENGES = {
  idor: 'basketAccessChallenge',
  'auth-bypass': 'loginAdminChallenge',
  xss: 'localXssChallenge',
  'negative order': 'negativeOrderChallenge',
  'raced like': 'timingAttackChallenge',
} as const;

const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
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
  await browser.close();
  await http.close();
  await sandbox.down(VARIANT);
});

describe('F3.3 done when: deterministic Red Team on Juice Shop', () => {
  it(
    'confirms the four reference classes and the raced like, as Juice Shop does, with no LLM call',
    async () => {
      const challenges = new JuiceShopChallenges(http, origin);
      const keys = Object.values(CHALLENGES);
      // A fresh container: nothing is solved yet.
      expect([...(await challenges.solved(keys)).values()]).toEqual(keys.map(() => false));

      const policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), 'juice-shop', [
        origin,
      ]);
      const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
        runId,
        variantId: VARIANT,
        policy,
      });

      const result = await new RunRedTeam({
        // The deterministic engine never calls the model; this gateway fails if it were asked.
        gateway: new ScriptedGateway([]),
        store,
        http,
        browser,
        target: (client, at) => ({
          users: new JuiceShopTestUsers(client, at),
          victim: new JuiceShopVictimData(client, at),
          businessLogic: new JuiceShopBusinessLogic(client, at),
        }),
      }).execute({
        runId,
        scope,
        origin,
        classes: ['idor', 'auth-bypass', 'xss', 'business-logic'],
        endpoints,
        findings: [],
        budget: new Budget({ maxTokens: 2_000_000, maxEur: 0.4 }),
      });

      const byEndpoint = result.findings.map((f) => `${f.testType} ${f.endpoint}`).sort();
      expect(byEndpoint).toEqual([
        'auth-bypass POST /rest/user/login',
        'business-logic POST /rest/products/reviews',
        'business-logic PUT /api/BasketItems/:id',
        'idor GET /rest/basket/:id',
        'xss GET /#/search',
      ]);
      // Each oracle verdict agrees with the target's own ground truth.
      expect([...(await challenges.solved(keys)).values()]).toEqual(keys.map(() => true));
      expect((await store.readRun(runId)).filter(isKnownEvent).map((e) => e.type)).not.toContain(
        'llm.call',
      );
    },
    5 * 60_000,
  );
});

describeBrowserAttackContract('PlaywrightBrowserAttack (Juice Shop)', {
  create: () => ({ port: browser, origin }),
  timeoutMs: 120_000,
});

// SynthLab's shopper accounts (F3.5a) on the same real Juice Shop.
describeShopperAccountContract('JuiceShopShopperAccounts (Juice Shop)', {
  create: () => ({ accounts: new JuiceShopShopperAccounts(http), baseUrl: origin }),
  timeoutMs: 60_000,
});

describe('JuiceShopShopperAccounts saved checkout (F3.5a)', () => {
  it('saves the shopper’s home address and test card in the new account', async () => {
    const email = `rosa-${newUlid().toLowerCase()}@janus.test`;
    const password = `pw-${newUlid().toLowerCase()}`;
    await new JuiceShopShopperAccounts(http).create(origin, {
      name: 'Rosa Sintética',
      email,
      password,
      saveCheckout: true,
      details: {
        address: 'Calle Sintética 1',
        'card expiry': '12/2080',
        'card number': '4111111111111111',
        city: 'Madrid',
        country: 'Spain',
        'mobile number': '600000001',
        state: 'Madrid',
        'zip code': '28001',
      },
    });

    const client = http.client(
      new NetworkGuard({
        target: 'juice-shop',
        origins: [origin],
        excludedPaths: [],
        allowedTests: ['http-probe'],
        maxRequestsPerSecond: 20,
      }),
      () => Promise.resolve(),
    );
    const login = await client.send({
      method: 'POST',
      url: `${origin}/rest/user/login`,
      testType: 'http-probe',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const { authentication } = JSON.parse(login.body) as { authentication: { token: string } };
    const read = async (path: string): Promise<unknown> =>
      (
        JSON.parse(
          (
            await client.send({
              method: 'GET',
              url: `${origin}${path}`,
              testType: 'http-probe',
              headers: { authorization: `Bearer ${authentication.token}` },
            })
          ).body,
        ) as { data: unknown }
      ).data;

    expect(await read('/api/Addresss')).toEqual([
      expect.objectContaining({
        fullName: 'Rosa Sintética',
        streetAddress: 'Calle Sintética 1',
        city: 'Madrid',
        zipCode: '28001',
      }),
    ]);
    expect(await read('/api/Cards')).toEqual([
      expect.objectContaining({ fullName: 'Rosa Sintética', expMonth: 12, expYear: 2080 }),
    ]);
  }, 60_000);
});
