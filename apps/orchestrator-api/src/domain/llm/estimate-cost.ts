import type { EventCost } from '@janus/shared-kernel';

import type { ModelPrice, TokenUsage } from './token-usage.js';

const PER_MILLION = 1_000_000;

export function estimateCost(usage: TokenUsage, price: ModelPrice, usdToEur: number): EventCost {
  if (!(usdToEur > 0)) throw new RangeError('usdToEur must be positive');
  const usd =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadInputTokens * price.cacheRead +
      usage.cacheCreationInputTokens * price.cacheWrite) /
    PER_MILLION;
  return { ...usage, estimatedEur: usd * usdToEur };
}
