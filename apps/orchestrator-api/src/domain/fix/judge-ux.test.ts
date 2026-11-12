import type { JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { endpointP95, judgeUx, V3_POLICY } from './judge-ux.js';

const rate = (successes: number, n: number) => ({ successes, n });
const steady = { mean: 0, low: -0.25, high: 0.25 };

describe('judgeUx (F3.5, V3)', () => {
  it('passes a fix that keeps the success rate and the latency within budget', () => {
    const verdict = judgeUx({
      a: rate(4, 8),
      b: rate(4, 8),
      difference: steady,
      latency: [{ endpoint: 'GET /rest/basket/:id', a: 20, b: 60 }],
    });

    expect(verdict.passed).toBe(true);
    // 60 ms is within max(20 × 1.25, 20 + 50) = 70 ms.
    expect(verdict.details).toContain('GET /rest/basket/:id p95 20 → 60 ms (budget 70 ms)');
  });

  it('rejects a drop of more than 25 points, even when not significant', () => {
    const verdict = judgeUx({
      a: rate(5, 8),
      b: rate(2, 8),
      difference: { mean: -0.375, low: -0.75, high: 0.05 },
      latency: [],
    });

    expect(verdict).toMatchObject({ passed: false });
    expect(verdict.details).toContain('dropped 37.5 points');
  });

  it('rejects a significant drop, even when small', () => {
    const verdict = judgeUx({
      a: rate(8, 8),
      b: rate(7, 8),
      difference: { mean: -0.125, low: -0.25, high: -0.01 },
      latency: [],
    });

    expect(verdict).toMatchObject({ passed: false });
    expect(verdict.details).toContain('significantly lower');
  });

  it('accepts a drop of exactly 25 points (2 of 8 sessions)', () => {
    expect(judgeUx({ a: rate(4, 8), b: rate(2, 8), difference: steady, latency: [] }).passed).toBe(
      true,
    );
  });

  it('rejects a p95 over budget on a touched endpoint', () => {
    const verdict = judgeUx({
      a: rate(4, 8),
      b: rate(4, 8),
      difference: steady,
      latency: [{ endpoint: 'PUT /api/BasketItems/:id', a: 400, b: 520 }],
    });

    // Budget max(400 × 1.25, 400 + 50) = 500 ms.
    expect(verdict).toMatchObject({ passed: false });
    expect(verdict.details).toContain('PUT /api/BasketItems/:id p95 400 → 520 ms (budget 500 ms)');
  });

  it('says so when shoppers never reached a touched endpoint, without failing on it', () => {
    const verdict = judgeUx({
      a: rate(4, 8),
      b: rate(4, 8),
      difference: steady,
      latency: [{ endpoint: 'GET /rest/basket/:id', a: null, b: 30 }],
    });

    expect(verdict.passed).toBe(true);
    expect(verdict.details).toContain('GET /rest/basket/:id not measured on both variants');
  });

  it('fails when a variant had no persona session to judge', () => {
    expect(judgeUx({ a: null, b: rate(1, 8), difference: null, latency: [] }).passed).toBe(false);
  });

  it('uses the agreed thresholds', () => {
    expect(V3_POLICY).toEqual({ successTolerance: 0.25, p95: { ratio: 1.25, ms: 50 } });
  });
});

describe('endpointP95 (F3.5, V3)', () => {
  const at = (seq: number, agentId: string, type: string, payload: unknown) =>
    ({
      id: `01JC0F2CB7E00000000000${String(seq).padStart(4, '0')}`,
      runId: '01JC0F2CB7E0000000000000AA',
      seq,
      ts: '2026-11-12T10:00:00.000Z',
      schemaVersion: 1,
      actor: { agentId, role: 'navigator' },
      type,
      payload,
    }) as JanusEvent;
  const started = (seq: number, agentId: string, variant: string) =>
    at(seq, agentId, 'session.started', {
      variant,
      kind: 'persona',
      persona: 'carmen-retired',
      seed: 1,
      attempt: 1,
    });
  const requests = (seq: number, agentId: string, list: { path: string; ms: number }[]) =>
    at(seq, agentId, 'page.requests', {
      stepIndex: seq,
      requests: list.map((request) => ({ method: 'GET', status: 200, ...request })),
    });

  it('takes the p95 of the requests that match an endpoint, per variant', () => {
    const events = [
      started(0, 'carmen-a', 'a'),
      started(1, 'carmen-b', 'b'),
      requests(2, 'carmen-a', [
        { path: '/rest/basket/6', ms: 10 },
        { path: '/rest/basket/7', ms: 30 },
        { path: '/rest/products/search', ms: 900 },
      ]),
      requests(3, 'carmen-b', [{ path: '/rest/basket/6', ms: 40 }]),
    ];
    const endpoint = { method: 'GET' as const, route: '/rest/basket/:id' };

    expect(endpointP95(events, 'a', endpoint)).toBeCloseTo(29, 5);
    expect(endpointP95(events, 'b', endpoint)).toBe(40);
    expect(endpointP95(events, 'c', endpoint)).toBeNull();
  });
});
