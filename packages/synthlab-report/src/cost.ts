import {
  isKnownEvent,
  type JanusEvent,
  type ModelRole,
  type SynthlabReport,
  type UnknownEvent,
} from '@janus/shared-kernel';

/** What the run spent on the LLM, from the `cost` of its events, and per model role. */
export function costOf(events: readonly (JanusEvent | UnknownEvent)[]): SynthlabReport['cost'] {
  const total = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    estimatedEur: 0,
  };
  const byRole = new Map<ModelRole, { calls: number; estimatedEur: number }>();
  for (const event of events) {
    if (event.cost === undefined) continue;
    total.calls += 1;
    total.inputTokens += event.cost.inputTokens;
    total.outputTokens += event.cost.outputTokens;
    total.cacheReadInputTokens += event.cost.cacheReadInputTokens;
    total.cacheCreationInputTokens += event.cost.cacheCreationInputTokens;
    total.estimatedEur += event.cost.estimatedEur;
    if (isKnownEvent(event) && event.type === 'llm.call') {
      const role = byRole.get(event.payload.role) ?? { calls: 0, estimatedEur: 0 };
      role.calls += 1;
      role.estimatedEur += event.cost.estimatedEur;
      byRole.set(event.payload.role, role);
    }
  }
  return {
    ...total,
    byRole: [...byRole]
      .map(([role, spent]) => ({ role, ...spent }))
      .sort((a, b) => b.estimatedEur - a.estimatedEur || a.role.localeCompare(b.role)),
  };
}
