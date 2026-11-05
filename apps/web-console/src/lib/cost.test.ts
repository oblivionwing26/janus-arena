import { describe, expect, it } from 'vitest';

import { sampleRun } from '@/test-support/sample-run';

import { summarizeCost } from './cost';

describe('summarizeCost', () => {
  it('adds up every event cost and reads the budget and thresholds (hand-computed)', () => {
    expect(summarizeCost(sampleRun())).toEqual({
      calls: 1,
      inputTokens: 1000,
      outputTokens: 50,
      cacheReadInputTokens: 400,
      cacheCreationInputTokens: 100,
      totalTokens: 1550,
      estimatedEur: 0.002,
      budget: { maxTokens: 100_000, maxEur: 1 },
      thresholds: ['warning'],
    });
  });

  it('is all zeros with no budget for an empty run', () => {
    expect(summarizeCost([])).toMatchObject({ calls: 0, totalTokens: 0, budget: null });
  });

  it('only counts the events it is given (the visible ones)', () => {
    expect(summarizeCost(sampleRun().slice(0, 4)).calls).toBe(0);
  });
});
