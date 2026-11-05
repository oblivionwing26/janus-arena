// A small synthetic run (orchestrator + two scripted buyers) for console tests.

import type { ConsoleEvent } from '@/lib/console-event';

export const RUN_ID = '01JC0F11RVN00000000000000A';

let nextId = 0;
function id(): string {
  nextId += 1;
  return `01JC0F11RVN0000000000${String(nextId).padStart(5, '0')}`;
}

function event(
  seq: number,
  secondsIn: number,
  agentId: string,
  role: string,
  type: string,
  payload: unknown,
  extra: Record<string, unknown> = {},
): ConsoleEvent {
  return {
    id: id(),
    runId: RUN_ID,
    seq,
    ts: new Date(Date.UTC(2026, 10, 5, 15, 0, 0) + secondsIn * 1000).toISOString(),
    schemaVersion: 1,
    actor: { agentId, role },
    type,
    payload,
    ...extra,
  } as ConsoleEvent;
}

export function sampleRun(): ConsoleEvent[] {
  nextId = 0;
  return [
    event(0, 0, 'orchestrator', 'orchestrator', 'run.started', {
      budget: { maxTokens: 100_000, maxEur: 1 },
    }),
    event(1, 1, 'scripted-buyer-0', 'scripted', 'agent.action', {
      stepIndex: 0,
      action: 'goto',
      durationMs: 120,
      ok: true,
    }),
    event(2, 1.5, 'scripted-buyer-1', 'scripted', 'agent.action', {
      stepIndex: 0,
      action: 'click',
      selector: 'role=button[name="Crear cuenta"]',
      durationMs: 80,
      ok: false,
    }),
    event(3, 2, 'scripted-buyer-0', 'scripted', 'agent.step', {
      stepIndex: 0,
      url: 'http://janus-r-x-app:3100/cart',
      durationMs: 900,
    }),
    event(
      4,
      12,
      'persona-ana-1',
      'navigator',
      'llm.call',
      { role: 'navigator', model: 'claude-haiku-5-5', durationMs: 700 },
      {
        cost: {
          inputTokens: 1000,
          outputTokens: 50,
          cacheReadInputTokens: 400,
          cacheCreationInputTokens: 100,
          estimatedEur: 0.002,
        },
      },
    ),
    event(5, 13, 'orchestrator', 'orchestrator', 'budget.threshold', {
      level: 'warning',
      usedTokens: 80_000,
      usedEur: 0.8,
      maxTokens: 100_000,
      maxEur: 1,
    }),
    event(6, 14, 'orchestrator', 'orchestrator', 'replay.bookmarked', { note: 'from the future' }),
    event(7, 15, 'orchestrator', 'orchestrator', 'run.completed', {
      outcome: 'error',
      reason: '1/2 sessions completed; failed: 1',
    }),
  ];
}
