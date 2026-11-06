import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const abandonment = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'abandonment');

describe('abandonment', () => {
  it.each(['abandon', 'patience_exhausted'] as const)(
    'fires on %s, at the last step',
    (outcome) => {
      const run = new RunBuilder();
      const ana = run.session('ana-0');
      ana.click('/', 'e6', 'Taza');
      ana.act('/products/taza', 'scroll');
      const end = ana.end(outcome, 'No me fío');

      expect(abandonment(run)).toEqual([
        {
          detector: 'abandonment',
          severity: 'high',
          agentId: 'ana-0',
          evidenceEventIds: [end],
          stepIndex: 1,
          url: 'http://shop.test/products/taza',
        },
      ]);
    },
  );

  it('does not fire on success', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/orders/7', 'done');
    ana.end('success');

    expect(abandonment(run)).toEqual([]);
  });

  it('typical false positive: running out of budget is the platform, not the user', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/', 'scroll');
    ana.end('budget_exhausted');

    expect(abandonment(run)).toEqual([]);
  });
});
