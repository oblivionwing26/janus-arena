import { fileURLToPath } from 'node:url';

import { Budget } from '../../domain/llm/budget.js';
import type { LlmRequest } from '../../domain/llm/llm-gateway-port.js';

/** recordings/fixtures at the repository root, from src or dist alike. */
export function fixturesDir(): string {
  return fileURLToPath(new URL('../../../../../recordings/fixtures/', import.meta.url));
}

/** repository root, for the local .env. */
export function repoRoot(): string {
  return fileURLToPath(new URL('../../../../../', import.meta.url));
}

// The request behind the committed F0.6 fixture. Changing it changes the hash, so the
// fixture must be recorded again with `pnpm --filter @janus/orchestrator-api llm:record-fixture`.
export function fixtureRequest(): LlmRequest {
  return {
    role: 'navigator',
    system: {
      stable:
        'You are a fixture used to test the Janus Arena LLM gateway. Answer with one word only.',
    },
    messages: [{ role: 'user', content: 'Reply with the word: ready' }],
    budget: new Budget({ maxTokens: 20_000, maxEur: 0.05 }),
    context: { runId: '01JC0F1XTVRE00000000000000', agentId: 'fixture-recorder' },
  };
}
