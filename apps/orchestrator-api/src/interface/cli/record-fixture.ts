// Makes ONE real API call (role navigator) and records it under recordings/fixtures/.
// Run by a human: `pnpm --filter @janus/orchestrator-api llm:record-fixture`.
// Needs ANTHROPIC_API_KEY in the environment or in the repository .env. The key is never
// printed or written: recordings hold only the request and response bodies.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { LlmCallObserver } from '../../domain/llm/llm-call-observer.js';
import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from '../../infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import { fixtureRequest, fixturesDir, repoRoot } from './fixture-request.js';

const envFile = join(repoRoot(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.ANTHROPIC_API_KEY === undefined || process.env.ANTHROPIC_API_KEY === '') {
  console.error('ANTHROPIC_API_KEY is not set (environment or repository .env).');
  process.exit(1);
}

const printingObserver: LlmCallObserver = {
  onLlmCall(record) {
    console.log(
      `llm.call ${record.role} -> ${record.model}: ${String(record.cost.inputTokens)} in, ` +
        `${String(record.cost.outputTokens)} out, ${record.cost.estimatedEur.toFixed(6)} EUR, ` +
        `${record.durationMs.toFixed(0)} ms`,
    );
    return Promise.resolve();
  },
  onBudgetThreshold(record) {
    console.log(`budget.threshold ${record.level}`);
    return Promise.resolve();
  },
};

const gateway = new AnthropicGateway(
  new RecordedLLMAdapter({
    mode: 'record',
    dir: fixturesDir(),
    inner: new SdkAnthropicTransport(),
  }),
  await loadModelsConfig(repoModelsConfigPath()),
  printingObserver,
);

const response = await gateway.complete(fixtureRequest());
const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
console.log(`answer: ${text.join(' ')}`);
console.log(`recorded under ${fixturesDir()}`);
