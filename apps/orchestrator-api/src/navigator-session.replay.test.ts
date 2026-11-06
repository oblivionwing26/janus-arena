// F1.4 "Done when", replay half: the recorded persona session runs again from its fixture,
// with no browser, no sandbox, no network and no API key, and does exactly the same thing.
// The fixture comes from navigator-session.sandbox.test.ts (JANUS_RECORD_SESSION=1).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigatorSession } from './application/navigator-session.js';
import { Budget } from './domain/llm/budget.js';
import type { LlmCallRecord } from './domain/llm/llm-call-observer.js';
import { InMemoryEventStore } from './infrastructure/event-store/in-memory-event-store.js';
import { AnthropicGateway } from './infrastructure/llm/anthropic-gateway.js';
import { loadModelsConfig, repoModelsConfigPath } from './infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from './infrastructure/llm/recorded-llm-adapter.js';
import { YamlPersonaCatalog } from './infrastructure/personas/yaml-persona-catalog.js';
import { ReplayingBrowser, type TapeEntry } from './test-support/browser-tape.js';
import {
  expectedOf,
  RECORDED_AGENT_ID,
  RECORDED_BUDGET,
  RECORDED_PERSONA,
  RECORDED_RUN_ID,
  RECORDED_TASK,
  recordedSessionDir,
} from './test-support/recorded-session.js';

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(join(recordedSessionDir, file), 'utf8'));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('F1.4 done when: replay the recorded persona session', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network is off in replay')));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it(`${RECORDED_PERSONA} does exactly what it did when it was recorded`, async () => {
    const store = new InMemoryEventStore();
    const browser = new ReplayingBrowser(fixture('tape.json') as TapeEntry[]);
    const calls: LlmCallRecord[] = [];
    const gateway = new AnthropicGateway(
      new RecordedLLMAdapter({ mode: 'replay', dir: join(recordedSessionDir, 'llm') }),
      await loadModelsConfig(repoModelsConfigPath()),
      {
        onLlmCall: (record) => Promise.resolve(void calls.push(record)),
        onBudgetThreshold: () => Promise.resolve(),
      },
    );
    const persona = await new YamlPersonaCatalog().get(RECORDED_PERSONA);
    let tick = 0;

    const result = await new NavigatorSession({
      browser,
      gateway,
      store,
      now: () => (tick += 10),
      // The recorded waits already happened; replaying them adds nothing.
      sleep: () => Promise.resolve(),
    }).run({
      runId: RECORDED_RUN_ID,
      agentId: RECORDED_AGENT_ID,
      baseUrl: 'http://replay.invalid',
      persona,
      task: RECORDED_TASK,
      budget: new Budget(RECORDED_BUDGET),
    });

    const expected = fixture('expected.json');
    expect(expectedOf(await store.readRun(RECORDED_RUN_ID))).toEqual(expected);
    expect(result.outcome).toBe('success');
    expect(browser.finished()).toBe(true);
    // The stable prefix was cached after the first call.
    expect(calls.slice(1).some((call) => call.cost.cacheReadInputTokens > 0)).toBe(true);
  });

  it('keeps no credentials in the fixture', () => {
    for (const file of filesUnder(recordedSessionDir)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/sk-ant-|x-api-key|authorization/i);
    }
  });
});
