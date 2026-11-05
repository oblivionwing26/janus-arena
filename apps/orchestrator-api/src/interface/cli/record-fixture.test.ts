// F0.6 "Done when": a real recorded call replays in a test with no network and no API key.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import { CollectingObserver } from '../../test-support/fake-anthropic.js';
import { fixtureRequest, fixturesDir } from './fixture-request.js';

async function fixtureFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('recorded F0.6 fixture', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubGlobal('fetch', () => {
      throw new Error('network is not allowed in this test');
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('replays the real navigator call without network or API key', async () => {
    const observer = new CollectingObserver();
    const gateway = new AnthropicGateway(
      new RecordedLLMAdapter({ mode: 'replay', dir: fixturesDir() }),
      await loadModelsConfig(repoModelsConfigPath()),
      observer,
    );

    const response = await gateway.complete(fixtureRequest());

    expect(response.model).toMatch(/^claude-/);
    expect(response.content.some((block) => block.type === 'text')).toBe(true);
    expect(response.cost.inputTokens).toBeGreaterThan(0);
    expect(response.cost.estimatedEur).toBeGreaterThan(0);
    expect(observer.calls).toHaveLength(1);
  });

  it('contains no credentials', async () => {
    const files = await fixtureFiles(fixturesDir());
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      expect(content, file).not.toMatch(/sk-ant-[\w-]{8,}/);
      expect(content.toLowerCase(), file).not.toMatch(/x-api-key|authorization/);
    }
  });
});
