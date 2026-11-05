// Valid sample events shared by the shared-kernel tests. Not part of the build.

import type { JanusEventType } from '../events/janus-event.js';

export const RUN_ID = '01JBZ7Q8K5V4W3X2Y1Z0ABCDEF';
export const EVENT_ID = '01JBZ7Q8K5V4W3X2Y1Z0ABCDEG';
export const OTHER_ID = '01JBZ7Q8K5V4W3X2Y1Z0ABCDEH';

export const sampleCost = {
  inputTokens: 1200,
  outputTokens: 80,
  cacheReadInputTokens: 900,
  cacheCreationInputTokens: 0,
  estimatedEur: 0.0021,
};

export function envelope(
  type: string,
  payload: unknown,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: EVENT_ID,
    runId: RUN_ID,
    seq: 0,
    ts: '2026-11-05T10:00:00.000Z',
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type,
    payload,
    ...overrides,
  };
}

export const validEvents: Record<JanusEventType, Record<string, unknown>> = {
  'run.started': envelope('run.started', { budget: { maxTokens: 200_000, maxEur: 2 } }),
  'run.completed': envelope('run.completed', { outcome: 'budget_exhausted', reason: 'EUR cap' }),
  'agent.step': envelope(
    'agent.step',
    { stepIndex: 3, url: 'http://shoplab.test/checkout', durationMs: 420 },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' } },
  ),
  'agent.action': envelope(
    'agent.action',
    {
      stepIndex: 3,
      action: 'click',
      ref: 'e12',
      selector: 'button[type=submit]',
      boundingBox: { x: 10, y: 20, width: 120, height: 32 },
      durationMs: 85,
      ok: true,
    },
    { actor: { agentId: 'scripted-buyer', role: 'scripted' } },
  ),
  'friction.signal': envelope('friction.signal', {
    detector: 'rage-click',
    severity: 'medium',
    evidenceEventIds: [OTHER_ID],
  }),
  'llm.call': envelope(
    'llm.call',
    { role: 'navigator', model: 'claude-haiku-5-5', durationMs: 900, requestHash: 'sha256:abc' },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' }, cost: sampleCost },
  ),
  'finding.created': envelope(
    'finding.created',
    {
      findingId: OTHER_ID,
      kind: 'dynamic',
      severity: 'high',
      title: 'IDOR on /api/orders/:id',
      status: 'confirmed',
      pocRef: 'poc/01JBZ7Q8K5V4W3X2Y1Z0ABCDEH.ts',
    },
    { actor: { agentId: 'red-team-1', role: 'red-team' } },
  ),
  'patch.proposed': envelope(
    'patch.proposed',
    {
      patchId: OTHER_ID,
      author: 'blue-team',
      findingId: OTHER_ID,
      branch: `janus/fix-${OTHER_ID}`,
      diff: '--- a/x.ts\n+++ b/x.ts\n',
    },
    { actor: { agentId: 'blue-team-1', role: 'blue-team' } },
  ),
  'verification.result': envelope('verification.result', {
    patchId: OTHER_ID,
    verifier: 'poc-replay',
    passed: true,
  }),
};
