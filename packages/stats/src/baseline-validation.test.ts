// F1.9 "Done when", kept: the competent baseline's validation run (runs/baseline-validation.yaml,
// 5 ShopLab tasks × 2 seeds, Sonnet), reduced to its session, oracle and run events. The oracle,
// not the agent, decides: at least 80 % of the tasks must be done.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isKnownEvent, parseRunExport } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { abSummary } from './ab-summary.js';

const { events } = parseRunExport(
  readFileSync(
    fileURLToPath(new URL('../fixtures/baseline-validation-f19.json', import.meta.url)),
    'utf8',
  ),
);

describe('the F1.9 baseline validation run', () => {
  it('completes at least 80 % of the ShopLab tasks, as the oracle sees them', () => {
    const [variant] = abSummary(events).variants;

    expect(variant?.baseline).toEqual({ successes: 9, n: 10 });
    expect((variant?.baseline.successes ?? 0) / (variant?.baseline.n ?? 1)).toBeGreaterThanOrEqual(
      0.8,
    );
  });

  it('failed only the coupon task of seed 1, with no order placed', () => {
    const failed = events
      .filter(isKnownEvent)
      .flatMap((event) =>
        event.type === 'task.verified' && event.payload.status !== 'passed' ? [event.payload] : [],
      );

    expect(failed).toEqual([
      expect.objectContaining({
        taskId: 'use-coupon',
        status: 'failed',
        checks: [{ check: 'an order was placed', passed: false, detail: 'no orders' }],
      }),
    ]);
  });
});
