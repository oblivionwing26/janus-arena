import { describe, expect, it } from 'vitest';

import { estimateCost } from './estimate-cost.js';

// Prices are USD per million tokens, as in config/models.yaml.
const price = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

describe('estimateCost', () => {
  it('prices each token kind separately and converts to EUR (hand-computed)', () => {
    const result = estimateCost(
      {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: 10_000,
        cacheCreationInputTokens: 2000,
      },
      price,
      0.5,
    );

    // USD: 1000*2 + 500*10 + 10000*0.2 + 2000*2.5 = 2000 + 5000 + 2000 + 5000 = 14000 per 1M
    //      = 0.014 USD -> 0.007 EUR at 0.5
    expect(result.estimatedEur).toBeCloseTo(0.007, 10);
    expect(result).toMatchObject({
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 10_000,
      cacheCreationInputTokens: 2000,
    });
  });

  it('costs nothing for zero usage', () => {
    const zero = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };

    expect(estimateCost(zero, price, 0.9).estimatedEur).toBe(0);
  });

  it('rejects a non-positive exchange rate', () => {
    const zero = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };

    expect(() => estimateCost(zero, price, 0)).toThrow(RangeError);
  });
});
