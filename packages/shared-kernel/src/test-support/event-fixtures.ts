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
  'surface.mapped': envelope('surface.mapped', {
    side: 'variant',
    ref: 'janus/variant-01JBZ7Q8K5V4W3X2Y1Z0ABCDEF',
    sha: 'b'.repeat(40),
    endpoints: [
      {
        method: 'GET',
        route: '/api/orders/:id',
        auth: true,
        ownerCheck: true,
        params: ['id'],
        file: 'src/app/api/orders/[id]/route.ts',
        line: 12,
      },
    ],
  }),
  'attack.attempt': envelope(
    'attack.attempt',
    {
      attemptId: OTHER_ID,
      number: 3,
      testType: 'idor',
      as: 'b',
      method: 'GET',
      path: '/rest/basket/6',
      status: 200,
      bytes: 512,
    },
    { actor: { agentId: 'red-team-1', role: 'red-team' } },
  ),
  'attack.verdict': envelope('attack.verdict', {
    attemptId: OTHER_ID,
    testType: 'idor',
    oracle: 'canary-leak',
    exploitable: true,
    evidence: 'user 22 received a record of user 21 holding "Apple Juice (1000ml)"',
  }),
  'finding.confirmed': envelope('finding.confirmed', {
    findingId: OTHER_ID,
    pocRef: `poc/${OTHER_ID}.json`,
    evidence: 'user 22 received a record of user 21 holding "Apple Juice (1000ml)"',
  }),
  'page.requests': envelope('page.requests', {
    stepIndex: 3,
    requests: [{ method: 'GET', path: '/rest/basket/6', status: 200, ms: 12.5 }],
  }),
  'finding.remediated': envelope('finding.remediated', {
    findingId: OTHER_ID,
    status: 'fixed',
    iterations: 1,
    patchId: OTHER_ID,
    branch: `janus/fix-${OTHER_ID}`,
  }),
  'scope.verified': envelope('scope.verified', {
    target: 'juice-shop',
    origins: ['http://janus-juice-shop-app:3000'],
    excludedPaths: ['/api/Challenges', '/snippets/**'],
    allowedTests: ['http-probe', 'idor'],
    maxRequestsPerSecond: 20,
  }),
  'scope.blocked': envelope('scope.blocked', {
    method: 'GET',
    origin: 'http://janus-juice-shop-app:3000',
    path: '/api/Challenges',
    testType: 'idor',
    reason: 'excluded-path',
  }),
  'audit.completed': envelope('audit.completed', {
    base: { ref: 'main', sha: 'a'.repeat(40) },
    variant: { ref: 'janus/variant-01JBZ7Q8K5V4W3X2Y1Z0ABCDEF', sha: 'b'.repeat(40) },
    introduced: { findings: 1, endpoints: 1, high: 1, critical: 0 },
    blocked: true,
    reasons: ['GET /api/orders/:id/invoice: new endpoint with a session and no owner check'],
  }),
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
  'budget.threshold': envelope('budget.threshold', {
    level: 'warning',
    usedTokens: 160_000,
    usedEur: 0.4,
    maxTokens: 200_000,
    maxEur: 2,
  }),
  'agent.thought': envelope(
    'agent.thought',
    { stepIndex: 3, text: 'Busco el botón de pagar.' },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' } },
  ),
  'session.ended': envelope(
    'session.ended',
    { outcome: 'abandon', reason: 'No encuentro el envío', steps: 12, durationMs: 41_000 },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' } },
  ),
  'page.error': envelope(
    'page.error',
    {
      stepIndex: 2,
      kind: 'http',
      url: 'http://shoplab.test/api/cart',
      status: 500,
      message: 'Internal Server Error',
    },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' } },
  ),
  'page.vitals': envelope(
    'page.vitals',
    { stepIndex: 2, url: 'http://shoplab.test/cart', lcpMs: 1800, cls: 0.02, inpMs: 120 },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' } },
  ),
  'page.screenshot': envelope(
    'page.screenshot',
    {
      stepIndex: 2,
      url: 'http://shoplab.test/cart',
      artifact: 'persona-ana-1/step-2.png',
      detector: 'dead-click',
    },
    { actor: { agentId: 'persona-ana-1', role: 'navigator' } },
  ),
  'session.started': envelope(
    'session.started',
    { variant: 'b', kind: 'persona', persona: 'carmen-retired', seed: 1, attempt: 1 },
    { actor: { agentId: 'carmen-retired-b-s1-a1', role: 'navigator' } },
  ),
  'task.verified': envelope(
    'task.verified',
    {
      taskId: 'buy-two-notebooks',
      status: 'failed',
      checks: [{ check: 'quantity of Cuaderno A5 punteado = 2', passed: false, detail: 'found 1' }],
      orderId: 6,
    },
    { actor: { agentId: 'competent-baseline-a-s1-a1', role: 'competent-baseline' } },
  ),
};
