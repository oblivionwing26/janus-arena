import { z } from 'zod';

const tokenCount = z.int().min(0);

// Cache reads and cache writes are billed differently, so they are counted apart.
export const eventCostSchema = z.object({
  inputTokens: tokenCount,
  outputTokens: tokenCount,
  cacheReadInputTokens: tokenCount,
  cacheCreationInputTokens: tokenCount,
  estimatedEur: z.number().min(0),
});

export type EventCost = z.infer<typeof eventCostSchema>;
