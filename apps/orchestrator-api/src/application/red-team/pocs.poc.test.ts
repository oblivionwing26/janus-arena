// `pnpm test:poc` (F3.4 "Done when"): the PoCs saved from a verified Red Team run
// (fixtures/poc/juice-shop/) still reproduce against a fresh Juice Shop sandbox, with fresh test
// users and a newly verified scope, and no LLM call. Run locally and by .github/workflows/poc.yml.

import { fileURLToPath } from 'node:url';

import { isKnownEvent, newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import { readPocDir } from '../../infrastructure/attack/poc-files.js';
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
import { ReplayPocs } from './replay-pocs.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/poc/juice-shop/', import.meta.url));
const VARIANT = 'poc-ci';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
let origin = '';

beforeAll(async () => {
  await sandbox.down(VARIANT);
  const { baseUrl } = await sandbox.up({ id: VARIANT, target: 'juice-shop', ref: 'image' });
  origin = new URL(baseUrl).origin;
});

afterAll(async () => {
  await browser.close();
  await http.close();
  await sandbox.down(VARIANT);
});

describe('Juice Shop PoCs (F3.4, brute force since F3.6)', () => {
  it('every saved PoC still reproduces on a fresh sandbox, with no LLM call', async () => {
    const files = await readPocDir(FIXTURES);
    expect(files.map(({ name }) => name)).toEqual([
      'auth-bypass-login.json',
      'brute-force-login.json',
      'business-logic-negative-order.json',
      'business-logic-raced-like.json',
      'idor-basket.json',
      'xss-search.json',
    ]);

    const store = new InMemoryEventStore();
    const runId = newUlid();
    const policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), 'juice-shop', [
      origin,
    ]);
    const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
      runId,
      variantId: VARIANT,
      policy,
    });
    const replayed = await new ReplayPocs({
      store,
      http,
      browser,
      target: (client, at) => ({
        users: new JuiceShopTestUsers(client, at),
        victim: new JuiceShopVictimData(client, at),
        businessLogic: new JuiceShopBusinessLogic(client, at),
      }),
    }).execute({ runId, scope, origin, pocs: files.map(({ poc }) => poc) });

    const verdicts = replayed.map(({ poc, verdict }, index) => [
      files[index]?.name,
      poc.oracle,
      verdict?.exploitable ?? 'not judged',
    ]);
    expect(verdicts).toEqual([
      ['auth-bypass-login.json', 'authenticated-as', true],
      ['brute-force-login.json', 'unthrottled-guessing', true],
      ['business-logic-negative-order.json', 'price-mismatch', true],
      ['business-logic-raced-like.json', 'duplicate-effect', true],
      ['idor-basket.json', 'canary-leak', true],
      ['xss-search.json', 'script-executed', true],
    ]);
    const types = (await store.readRun(runId)).filter(isKnownEvent).map((event) => event.type);
    expect(types).not.toContain('llm.call');
    // A replay judges, it never files a new finding.
    expect(types).not.toContain('finding.created');
  });
});
