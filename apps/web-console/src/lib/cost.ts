import { isKnownEvent } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';

export interface CostSummary {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly totalTokens: number;
  readonly estimatedEur: number;
  readonly budget: { readonly maxTokens: number; readonly maxEur: number } | null;
  readonly thresholds: readonly ('warning' | 'exhausted')[];
}

/** Spend of a run so far: the sum of every event's `cost`, plus its budget and thresholds. */
export function summarizeCost(events: readonly ConsoleEvent[]): CostSummary {
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let estimatedEur = 0;
  let budget: CostSummary['budget'] = null;
  const thresholds: ('warning' | 'exhausted')[] = [];

  for (const event of events) {
    if (event.cost !== undefined) {
      calls += 1;
      inputTokens += event.cost.inputTokens;
      outputTokens += event.cost.outputTokens;
      cacheReadInputTokens += event.cost.cacheReadInputTokens;
      cacheCreationInputTokens += event.cost.cacheCreationInputTokens;
      estimatedEur += event.cost.estimatedEur;
    }
    if (!isKnownEvent(event)) continue;
    if (event.type === 'run.started') budget = event.payload.budget;
    if (event.type === 'budget.threshold') thresholds.push(event.payload.level);
  }

  return {
    calls,
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    totalTokens: inputTokens + outputTokens + cacheReadInputTokens + cacheCreationInputTokens,
    estimatedEur,
    budget,
    thresholds,
  };
}
