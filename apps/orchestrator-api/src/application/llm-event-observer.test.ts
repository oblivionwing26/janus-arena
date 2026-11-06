import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { LlmEventObserver } from './llm-event-observer.js';

const RUN_ID = '01JC0F14LLM0000000000000AA';
const cost = {
  inputTokens: 900,
  outputTokens: 40,
  cacheReadInputTokens: 2000,
  cacheCreationInputTokens: 0,
  estimatedEur: 0.0003,
};

describe('LlmEventObserver', () => {
  it('records llm.call with its cost from the calling agent, and thresholds from the orchestrator', async () => {
    const store = new InMemoryEventStore();
    const observer = new LlmEventObserver(store);

    await observer.onLlmCall({
      runId: RUN_ID,
      agentId: 'carmen-retired-0',
      role: 'navigator',
      model: 'claude-haiku-5-5',
      durationMs: 800,
      requestHash: 'sha256:abc',
      cost,
    });
    await observer.onBudgetThreshold({
      runId: RUN_ID,
      agentId: 'carmen-retired-0',
      level: 'warning',
      snapshot: { state: 'warning', usedTokens: 80, usedEur: 0.8, maxTokens: 100, maxEur: 1 },
    });

    const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
    expect(events.map((event) => [event.seq, event.type, event.actor.agentId])).toEqual([
      [0, 'llm.call', 'carmen-retired-0'],
      [1, 'budget.threshold', 'orchestrator'],
    ]);
    expect(events[0]?.cost).toEqual(cost);
    expect(events[0]?.actor.role).toBe('navigator');
  });
});
