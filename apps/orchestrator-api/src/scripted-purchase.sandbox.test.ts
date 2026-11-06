// F0.9 "Done when", local only (`pnpm test:sandbox`): the scripted agent buys in a ShopLab
// variant through the remote browser on janus-sbx, and its events land in Postgres in order.
// Needs `docker compose up -d` (proxy, browser, browser-relay, Postgres).

import { randomBytes } from 'node:crypto';

import { isKnownEvent, newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RunEventRecorder } from './application/run-event-recorder.js';
import { ScriptedPurchaseAgent } from './application/scripted-purchase-agent.js';
import { PlaywrightRunner } from './infrastructure/browser/playwright-runner.js';
import { PostgresEventStore } from './infrastructure/event-store/postgres-event-store.js';
import { DockerCli } from './infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from './infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from './infrastructure/sandbox/workspace.js';
import { describeBrowserContract } from './test-support/browser-contract.js';
import { testDatabaseUrl } from './test-support/test-database-url.js';

const VARIANT = 'f09';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const browser = new PlaywrightRunner();
let baseUrl = '';
let store: PostgresEventStore;

beforeAll(async () => {
  ({ baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'main' }));
  store = await PostgresEventStore.connect(testDatabaseUrl());
}, 10 * 60_000);

afterAll(async () => {
  await browser.shutdown();
  await store.close();
  await sandbox.down(VARIANT);
}, 60_000);

describeBrowserContract('PlaywrightRunner (ShopLab)', {
  browser: () => browser,
  baseUrl: () => baseUrl,
  page: '/login',
  fetchable: '/api/health',
  field: { label: 'Email' },
  secret: { label: 'Contraseña' },
  link: { role: 'link', name: 'Crea una' },
  linkTarget: /\/register$/,
  choice: {
    // ShopLab shows the quantity select to signed-in users only.
    prepare: async (runner, session) => {
      await runner.goto(session, `${baseUrl}/register`);
      await runner.type(session, { label: 'Nombre' }, 'Contrato Select');
      await runner.type(
        session,
        { label: 'Email' },
        `contract-${newUlid().toLowerCase()}@shoplab.test`,
      );
      await runner.type(
        session,
        { label: 'Contraseña (mínimo 8 caracteres)' },
        'contract-password-1',
      );
      await runner.type(session, { label: 'Dirección de envío' }, 'Calle Contrato 1, 28001 Madrid');
      await runner.click(session, { role: 'button', name: 'Crear cuenta' });
      await runner.waitForUrl(session, /\/$/);
    },
    page: '/products/taza-ceramica',
    target: { role: 'combobox', name: 'Cantidad' },
    option: '2',
  },
});

describe('F0.9 done when', () => {
  it('the scripted agent buys in ShopLab and its events are stored in order', async () => {
    const runId = newUlid();
    const recorder = new RunEventRecorder(store, runId, {
      agentId: 'scripted-buyer',
      role: 'scripted',
    });
    const agent = new ScriptedPurchaseAgent(browser, recorder);

    const result = await agent.run({
      baseUrl,
      buyer: {
        name: 'Comprador Programado',
        email: `scripted-${runId.toLowerCase()}@shoplab.test`,
        password: randomBytes(12).toString('base64url'),
        address: 'Calle Programada 1, 28001 Madrid',
      },
    });

    expect(result.orderUrl).toMatch(/^http:\/\/janus-f09-app:3100\/orders\/\d+/);

    const events = await store.readRun(runId);
    expect(events.every(isKnownEvent)).toBe(true);
    expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index));
    const steps = events.filter((event) => event.type === 'agent.step');
    expect(steps).toHaveLength(6);
    expect(events.filter((event) => event.type === 'agent.action').length).toBeGreaterThan(10);
    expect(events.at(-1)?.type).toBe('agent.step');
  }, 120_000);

  it('blocks requests that leave the variant origin', async () => {
    const session = await browser.newSession({ baseUrl });
    try {
      await expect(browser.goto(session, 'https://example.com/')).rejects.toThrow();
    } finally {
      await browser.close(session);
    }
  }, 60_000);
});
