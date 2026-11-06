// F1.4 "Done when", recording half. Local only, and only on purpose: it calls the real API.
//   JANUS_RECORD_SESSION=1 pnpm test:sandbox
// Needs `docker compose up -d` and ANTHROPIC_API_KEY (environment or .env). One persona buys in
// a real ShopLab variant; every LLM response and every browser call is saved as a fixture
// under recordings/fixtures/sessions/<persona>/, which the replay test runs without network.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LlmEventObserver } from './application/llm-event-observer.js';
import { NavigatorSession } from './application/navigator-session.js';
import { Budget } from './domain/llm/budget.js';
import { PlaywrightRunner } from './infrastructure/browser/playwright-runner.js';
import { InMemoryEventStore } from './infrastructure/event-store/in-memory-event-store.js';
import { AnthropicGateway } from './infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from './infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from './infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from './infrastructure/llm/recorded-llm-adapter.js';
import { YamlPersonaCatalog } from './infrastructure/personas/yaml-persona-catalog.js';
import { DockerCli } from './infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from './infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from './infrastructure/sandbox/workspace.js';
import { RecordingBrowser } from './test-support/browser-tape.js';
import {
  expectedOf,
  RECORDED_AGENT_ID,
  RECORDED_BUDGET,
  RECORDED_PERSONA,
  RECORDED_RUN_ID,
  RECORDED_TASK,
  recordedSessionDir,
} from './test-support/recorded-session.js';

const VARIANT = 'f14';
const recording = process.env.JANUS_RECORD_SESSION === '1';
const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const playwright = new PlaywrightRunner();
let baseUrl = '';

describe.skipIf(!recording)('F1.4 done when: record a persona session', () => {
  beforeAll(async () => {
    ({ baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'main' }));
  }, 10 * 60_000);

  afterAll(async () => {
    await playwright.shutdown();
    await sandbox.down(VARIANT);
  }, 60_000);

  it(
    `${RECORDED_PERSONA} buys in ShopLab with the real navigator, and it is recorded`,
    async () => {
      await rm(recordedSessionDir, { recursive: true, force: true });
      await mkdir(recordedSessionDir, { recursive: true });
      const store = new InMemoryEventStore();
      const browser = new RecordingBrowser(playwright);
      const gateway = new AnthropicGateway(
        new RecordedLLMAdapter({
          mode: 'record',
          dir: join(recordedSessionDir, 'llm'),
          inner: new SdkAnthropicTransport(),
        }),
        await loadModelsConfig(repoModelsConfigPath()),
        new LlmEventObserver(store),
      );
      const persona = await new YamlPersonaCatalog().get(RECORDED_PERSONA);

      const result = await new NavigatorSession({ browser, gateway, store }).run({
        runId: RECORDED_RUN_ID,
        agentId: RECORDED_AGENT_ID,
        baseUrl,
        persona,
        task: RECORDED_TASK,
        budget: new Budget(RECORDED_BUDGET),
      });

      const events = await store.readRun(RECORDED_RUN_ID);
      await writeFile(
        join(recordedSessionDir, 'tape.json'),
        `${JSON.stringify(browser.tape, null, 2)}\n`,
      );
      await writeFile(
        join(recordedSessionDir, 'expected.json'),
        `${JSON.stringify(expectedOf(events), null, 2)}\n`,
      );
      await writeFile(
        join(recordedSessionDir, 'events.json'),
        `${JSON.stringify(events, null, 2)}\n`,
      );
      console.log(JSON.stringify({ result, ...expectedOf(events) }, null, 2));

      expect(result.outcome).toBe('success');
    },
    15 * 60_000,
  );
});
