import { describe, expect, it } from 'vitest';

import type { DualReport } from '../../domain/report/dual-report.js';
import { formatDualReport } from './format-dual-report.js';

const REPORT: DualReport = {
  format: 'janus-dual-report',
  version: 1,
  target: 'juice-shop',
  janusCommit: 'abcdef1234567890abcdef1234567890abcdef12',
  ux: {
    runId: '01JC0F2LB7E0000000000000XA',
    variants: [
      { variant: 'a', personas: { successes: 4, n: 8 }, baseline: { successes: 2, n: 2 } },
      { variant: 'b', personas: { successes: 4, n: 8 }, baseline: { successes: 2, n: 2 } },
    ],
    difference: { mean: 0, low: -0.25, high: 0.25 },
    verdict: 'no-detectable-difference',
  },
  findings: [
    {
      findingId: '01JC0F2LB7E0000000000000FF',
      runId: '01JC0F2LB7E0000000000000RT',
      kind: 'dynamic',
      severity: 'high',
      title: 'Another user’s data is reachable (IDOR)',
      status: 'confirmed',
      where: 'GET /rest/basket/:id',
      tool: 'red-team',
    },
  ],
  pocs: [],
  fixes: [
    {
      runId: '01JC0F2LB7E0000000000000BT',
      findingId: '01JC0F2LB7E0000000000000FF',
      status: 'fixed',
      iterations: 1,
      branch: 'janus/fix-01JC0F2LB7E0000000000000FF',
      patchId: '01JC0F2LB7E0000000000000PA',
      diff: '--- a/routes/basket.ts\n+++ b/routes/basket.ts\n',
      verifications: [{ verifier: 'poc-replay', passed: true, details: 'status 403' }],
    },
  ],
  tradeoffs: [],
  cost: { runs: [{ runId: '01JC0F2LB7E0000000000000XA', role: 'ux', eur: 0.49 }], totalEur: 0.49 },
  eventLogs: [{ runId: '01JC0F2LB7E0000000000000XA', sha256: 'e'.repeat(64) }],
  tools: { node: 'v24.12.0' },
};

describe('formatDualReport (F3.7)', () => {
  const markdown = formatDualReport(REPORT);

  it('opens with how to verify it, with Janus or with cosign alone', () => {
    expect(markdown).toContain('# Janus dual report: juice-shop');
    expect(markdown).toContain('pnpm janus verify');
    expect(markdown).toContain(
      'cosign verify-blob --key keys/janus.pub --signature dual-report.json.sig --insecure-ignore-tlog dual-report.json',
    );
  });

  it('shows the A/B as synthetic task success, never conversion', () => {
    expect(markdown).toContain('| a | 4/8 | 2/2 |');
    expect(markdown).toContain('Synthetic task success');
    expect(markdown).not.toMatch(/conversion lift/i);
  });

  it('lists findings, fixes with their verifiers, cost and provenance', () => {
    expect(markdown).toContain(
      '| high | confirmed | dynamic | red-team | GET /rest/basket/:id | Another user’s data is reachable (IDOR) |',
    );
    expect(markdown).toContain('| poc-replay | passed | status 403 |');
    expect(markdown).toContain('Total cost: 0.49 €');
    expect(markdown).toContain(`| 01JC0F2LB7E0000000000000XA | ux | ${'e'.repeat(64)} |`);
  });
});
