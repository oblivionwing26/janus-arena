import { CANARY_CHECK, newUlid } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { launchDayCurves } from './launch-day-curves.js';
import { ReportRun } from './test-support/report-run.js';

const SHOP = 'http://janus-r-test-a-app:3100';

/** A shopper that ends, optionally meets a defense and optionally passes its task. */
function shopper(
  run: ReportRun,
  agentId: string,
  variant: string,
  options: {
    passed: boolean;
    met?: { status: number; path: string };
    canary?: boolean;
    seed?: number;
  },
) {
  run.emit(agentId, 'navigator', 'session.started', {
    variant,
    kind: 'persona',
    persona: 'carmen-retired',
    seed: options.seed ?? 1,
    attempt: 1,
    role: 'legitimate',
    client: '10.20.0.1',
    task: 'buy-mug',
  });
  if (options.met !== undefined) {
    run.emit(agentId, 'navigator', 'page.error', {
      stepIndex: 1,
      kind: 'http',
      url: `${SHOP}${options.met.path}`,
      status: options.met.status,
      message: 'refused',
    });
  }
  run.emit(agentId, 'navigator', 'session.ended', {
    outcome: options.passed ? 'success' : 'abandon',
    steps: 3,
    durationMs: 10,
  });
  run.emit(agentId, 'navigator', 'task.verified', {
    taskId: 'buy-mug',
    status: options.passed ? 'passed' : 'failed',
    checks: [
      { check: 'quantity of Taza = 1', passed: options.passed },
      ...(options.canary === undefined ? [] : [{ check: CANARY_CHECK, passed: options.canary }]),
    ],
  });
}

/** A saboteur that gets `answers` replies in turn, then its verdict. */
function saboteur(
  run: ReportRun,
  agentId: string,
  variant: string,
  task: 'saturation' | 'brute-force',
  statuses: number[],
  exploitable: boolean,
) {
  run.emit(agentId, 'red-team', 'session.started', {
    variant,
    kind: 'saboteur',
    seed: 0,
    attempt: 1,
    role: 'saboteur',
    client: '10.99.0.1',
  });
  let last = newUlid();
  statuses.forEach((status, index) => {
    last = newUlid();
    run.emit(agentId, 'red-team', 'attack.attempt', {
      attemptId: last,
      number: index + 1,
      testType: task,
      as: 'anonymous',
      method: 'POST',
      path: '/api/auth/logout',
      status,
      bytes: 2,
    });
  });
  run.emit('orchestrator', 'orchestrator', 'attack.verdict', {
    attemptId: last,
    testType: task,
    oracle: task === 'saturation' ? 'unthrottled-requests' : 'unthrottled-guessing',
    exploitable,
    evidence: 'x',
  });
  run.emit(agentId, 'red-team', 'session.ended', { outcome: 'success', steps: 1, durationMs: 1 });
}

describe('launchDayCurves (F4.1)', () => {
  it('gives each variant its three curves: shoppers that succeed, attacks that do, shoppers blocked', () => {
    const run = new ReportRun();
    // A, no defense: every shopper passes, nothing is refused, both saboteurs get through.
    for (let i = 0; i < 4; i++) shopper(run, `shopper-a-${String(i)}`, 'a', { passed: true });
    saboteur(run, 'saboteur-a-0', 'a', 'saturation', [200, 200, 200, 200], true);
    saboteur(run, 'saboteur-a-1', 'a', 'brute-force', [201, 401, 401, 200], true);
    // B, defended: one shopper is rate limited and fails, another meets the step-up and still
    // buys; the saturation is refused after two requests and the guesses are locked.
    shopper(run, 'shopper-b-0', 'b', { passed: true });
    shopper(run, 'shopper-b-1', 'b', { passed: true, met: { status: 403, path: '/api/checkout' } });
    shopper(run, 'shopper-b-2', 'b', {
      passed: false,
      met: { status: 429, path: '/api/cart/items' },
    });
    shopper(run, 'shopper-b-3', 'b', { passed: true });
    saboteur(run, 'saboteur-b-0', 'b', 'saturation', [200, 200, 429, 429], false);
    saboteur(run, 'saboteur-b-1', 'b', 'brute-force', [201, 401, 429, 429], false);

    const { variants } = launchDayCurves(run.events());

    const [a, b] = variants;
    expect(variants.map((each) => each.variant)).toEqual(['a', 'b']);
    expect(a?.legitimate).toMatchObject({ sessions: 4 });
    expect(a?.legitimate.success).toMatchObject({ rate: 1, successes: 4, n: 4 });
    expect(a?.legitimate.blocked).toMatchObject({ rate: 0, successes: 0, n: 4 });
    expect(a?.attacks.success).toMatchObject({ rate: 1, successes: 2, n: 2 });
    expect(a?.attacks.byTask).toEqual([
      { task: 'brute-force', verdicts: 1, exploitable: 1, refusedAfter: [] },
      { task: 'saturation', verdicts: 1, exploitable: 1, refusedAfter: [] },
    ]);
    expect(b?.legitimate.success).toMatchObject({ rate: 0.75, successes: 3, n: 4 });
    expect(b?.legitimate.blocked).toMatchObject({ rate: 0.5, successes: 2, n: 4 });
    expect(b?.attacks.success).toMatchObject({ rate: 0, successes: 0, n: 2 });
    expect(b?.attacks.byTask).toEqual([
      { task: 'brute-force', verdicts: 1, exploitable: 0, refusedAfter: [2] },
      { task: 'saturation', verdicts: 1, exploitable: 0, refusedAfter: [2] },
    ]);
  });

  it('keeps a 429 or a checkout 403 apart from any other error a shopper meets', () => {
    const run = new ReportRun();
    shopper(run, 'shopper-a-0', 'a', { passed: true, met: { status: 404, path: '/nope' } });
    shopper(run, 'shopper-a-1', 'a', { passed: true, met: { status: 403, path: '/api/orders/3' } });
    shopper(run, 'shopper-a-2', 'a', { passed: true, met: { status: 500, path: '/api/checkout' } });

    const [a] = launchDayCurves(run.events()).variants;

    expect(a?.legitimate.blocked).toMatchObject({ successes: 0, n: 3 });
  });

  it('counts a shopper once however many times it was refused', () => {
    const run = new ReportRun();
    shopper(run, 'shopper-a-0', 'a', { passed: true, met: { status: 429, path: '/api/x' } });
    run.emit('shopper-a-0', 'navigator', 'page.error', {
      stepIndex: 2,
      kind: 'http',
      url: `${SHOP}/api/y`,
      status: 429,
      message: 'refused',
    });

    const [a] = launchDayCurves(run.events()).variants;

    expect(a?.legitimate.blocked).toMatchObject({ successes: 1, n: 1 });
  });

  it('reports contamination apart from success, and only from shoppers', () => {
    const run = new ReportRun();
    shopper(run, 'shopper-a-0', 'a', { passed: true, canary: true });
    shopper(run, 'shopper-a-1', 'a', { passed: true, canary: false });

    const [a] = launchDayCurves(run.events()).variants;

    expect(a?.contaminated).toBe(1);
    expect(a?.legitimate.success).toMatchObject({ successes: 2, n: 2 });
  });

  it('leaves out shoppers that never ended, as the statistics do', () => {
    const run = new ReportRun();
    shopper(run, 'shopper-a-0', 'a', { passed: true });
    run.emit('shopper-a-1', 'navigator', 'session.started', {
      variant: 'a',
      kind: 'persona',
      persona: 'carmen-retired',
      seed: 2,
      attempt: 1,
      task: 'buy-mug',
    });

    const [a] = launchDayCurves(run.events()).variants;

    expect(a?.legitimate.sessions).toBe(1);
  });

  it('has no attack curve in a run without saboteurs, and no shopper curves without shoppers', () => {
    const none = new ReportRun();
    shopper(none, 'shopper-a-0', 'a', { passed: true });
    const only = new ReportRun();
    saboteur(only, 'saboteur-a-0', 'a', 'saturation', [200], false);

    expect(launchDayCurves(none.events()).variants[0]?.attacks).toEqual({
      success: null,
      byTask: [],
    });
    expect(launchDayCurves(only.events()).variants[0]?.legitimate).toEqual({
      sessions: 0,
      success: null,
      blocked: null,
    });
    expect(launchDayCurves([]).variants).toEqual([]);
  });
});
