import { synthlabReportSchema } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { buildSynthlabReport } from './build-report.js';
import { reportConfigSchema } from './report-config.js';
import { RUN_ID, ReportRun } from './test-support/report-run.js';

const CONFIG = reportConfigSchema.parse({
  routes: ['/products/:slug', '/orders/:id'],
  funnel: [
    { name: 'Inicio', route: '/' },
    { name: 'Carrito', route: '/cart' },
    { name: 'Pedido', route: '/orders/:id' },
  ],
  topZones: 5,
});

function abRun(): ReportRun {
  const run = new ReportRun();
  for (const variant of ['a', 'b']) {
    const persona = run.session(`carmen-${variant}-s1-a1`, { variant, persona: 'carmen' });
    persona.step('/');
    const click = persona.step('/cart', {
      selector: 'role=link[name="Otras opciones"]',
      box: { x: 0, y: 0, width: 10, height: 10 },
    });
    if (variant === 'a') {
      run.signal(`carmen-${variant}-s1-a1`, 'dead-click', 'medium', [click.action], {
        stepIndex: click.stepIndex,
        path: '/cart',
      });
      persona.end('abandon');
    } else {
      persona.step('/orders/9');
      persona.end('success');
    }
    persona.llmCall(0.001, { input: 100, output: 10 });
    const baseline = run.session(`competent-baseline-${variant}-s1-a1`, {
      variant,
      kind: 'baseline',
    });
    baseline.step('/');
    baseline.end('success');
  }
  // A session the infrastructure lost: excluded everywhere.
  run.session('diego-a-s2-a1', { persona: 'diego', seed: 2 }).step('/');
  return run;
}

describe('buildSynthlabReport', () => {
  it('puts funnel, zones, detectors, success and cost of a run in one valid report', () => {
    const report = buildSynthlabReport(RUN_ID, abRun().events(), CONFIG);

    expect(synthlabReportSchema.parse(report)).toEqual(report);
    expect(report).toMatchObject({
      format: 'janus-synthlab-report',
      version: 1,
      runId: RUN_ID,
      sessions: {
        persona: 3,
        baseline: 2,
        excluded: [{ agentId: 'diego-a-s2-a1', reason: 'never ended (infrastructure)' }],
      },
      detectors: [{ detector: 'dead-click', signals: 1, sessions: 1 }],
      cost: { calls: 2, estimatedEur: 0.002 },
    });
    expect(
      report.funnel.map((row) => [row.variant, row.sessions, row.steps.map((s) => s.reached)]),
    ).toEqual([
      ['a', 1, [1, 1, 0]],
      ['b', 1, [1, 1, 1]],
    ]);
    expect(report.zones).toMatchObject([
      { rank: 1, route: '/cart', element: 'role=link[name="Otras opciones"]', intensity: 2 },
    ]);
    expect(
      report.success.variants.map((v) => [v.variant, v.personas?.successes, v.personas?.n]),
    ).toEqual([
      ['a', 0, 1],
      ['b', 1, 1],
    ]);
    expect(report.success.comparison).toMatchObject({ a: 'a', b: 'b', pairs: 1 });
    expect(report.zonesByVariant?.map((entry) => [entry.variant, entry.zones.length])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
  });

  it('gives the same report for the same events, whatever their order', () => {
    const events = abRun().events();

    const forward = buildSynthlabReport(RUN_ID, events, CONFIG);
    const shuffled = buildSynthlabReport(RUN_ID, [...events].reverse(), CONFIG);

    expect(shuffled).toEqual(forward);
    expect(forward.source).toEqual({ events: events.length, lastSeq: events.length - 1 });
  });
});
