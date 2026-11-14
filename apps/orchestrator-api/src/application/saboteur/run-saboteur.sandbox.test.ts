// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and the agent browser from
// docker-compose.yml. F4.1a on the real ShopLab image: a saboteur loads a variant and guesses at
// an account, and its verdict tells a variant without defenses from one with them. No LLM, no cost.
//
// SHOPLAB_REF picks the ShopLab branch to build (main by default); it must serve the ownership
// token (step/f4-1a-verify-route until that branch is merged).

import { isKnownEvent, newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SessionJob } from '../../domain/run/session-queue-port.js';
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
import { VerifyOwnership } from '../scope/verify-ownership.js';
import { RunSaboteur } from './run-saboteur.js';
import { SaboteurScopes } from './saboteur-scopes.js';

const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const store = new InMemoryEventStore();
const runId = newUlid();
const open = { id: 'saboteur-test-a', baseUrl: '' };
const defended = { id: 'saboteur-test-b', baseUrl: '' };
const ref = process.env.SHOPLAB_REF ?? 'main';
const never = new AbortController().signal;

beforeAll(async () => {
  for (const variant of [open, defended]) await sandbox.down(variant.id);
  open.baseUrl = (
    await sandbox.up({
      id: open.id,
      target: 'shoplab',
      ref,
      env: { SHOPLAB_TRUST_FORWARDED_FOR: '1' },
    })
  ).baseUrl;
  defended.baseUrl = (
    await sandbox.up({
      id: defended.id,
      target: 'shoplab',
      ref,
      env: {
        SHOPLAB_TRUST_FORWARDED_FOR: '1',
        SHOPLAB_RATE_LIMIT_IP: '20/60',
        SHOPLAB_RATE_LIMIT_ACCOUNT: '3/60',
      },
    })
  ).baseUrl;
}, 900_000);

afterAll(async () => {
  await http.close();
  for (const variant of [open, defended]) await sandbox.down(variant.id);
});

async function saboteur() {
  const config = await loadScopeConfig(repoScopeConfigPath());
  return new RunSaboteur({
    store,
    http,
    scopes: new SaboteurScopes({
      verify: new VerifyOwnership({ tokens: sandbox, http, store }),
      policyFor: (target, origin) => scopePolicyFor(config, target, [origin]),
    }),
    sleep: () => Promise.resolve(),
  });
}

const jobFor = (variant: typeof open, seed: number): SessionJob => ({
  runId,
  target: 'shoplab',
  attempt: 1,
  variant: {
    key: variant.id.endsWith('a') ? 'a' : 'b',
    variantId: variant.id,
    baseUrl: variant.baseUrl,
  },
  spec: {
    sessionIndex: seed,
    variant: variant.id.endsWith('a') ? 'a' : 'b',
    kind: 'saboteur',
    seed,
    clientIp: `10.99.0.${String(seed + 1)}`,
    requestsPerSecond: 20,
  },
});

describe('F4.1a done when (saboteurs on ShopLab)', () => {
  it('finds the open variant loadable and guessable, and the defended one not', async () => {
    const run = await saboteur();
    const verdicts: Record<string, { exploitable: boolean; oracle: string }> = {};

    for (const [name, variant] of [
      ['open', open],
      ['defended', defended],
    ] as const) {
      for (const seed of [0, 1]) {
        expect(await run.execute(jobFor(variant, seed), never)).toMatchObject({
          status: 'completed',
        });
        const events = (await store.readRun(runId)).filter(isKnownEvent);
        const last = events.filter((event) => event.type === 'attack.verdict').at(-1)?.payload;
        verdicts[`${name}-${String(seed)}`] = {
          exploitable: last?.exploitable ?? false,
          oracle: last?.oracle ?? '',
        };
      }
    }

    expect(verdicts).toEqual({
      'open-0': { exploitable: true, oracle: 'unthrottled-requests' },
      'open-1': { exploitable: true, oracle: 'unthrottled-guessing' },
      'defended-0': { exploitable: false, oracle: 'unthrottled-requests' },
      'defended-1': { exploitable: false, oracle: 'unthrottled-guessing' },
    });
  });
});
