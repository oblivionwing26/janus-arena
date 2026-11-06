import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const performance = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'performance');

describe('performance', () => {
  it('flags "needs improvement" as medium and "poor" as high, at the worst metric', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/', 'scroll');
    const slow = ana.vitals('/', { lcpMs: 3200, cls: 0.02 });
    ana.act('/products/taza', 'scroll');
    const shaky = ana.vitals('/products/taza', { lcpMs: 1200, cls: 0.3, inpMs: 250 });

    expect(performance(run)).toEqual([
      {
        detector: 'performance',
        severity: 'medium',
        agentId: 'ana-0',
        evidenceEventIds: [slow],
        stepIndex: 0,
        url: 'http://shop.test/',
      },
      {
        detector: 'performance',
        severity: 'high',
        agentId: 'ana-0',
        evidenceEventIds: [shaky],
        stepIndex: 1,
        url: 'http://shop.test/products/taza',
      },
    ]);
  });

  it('typical false positive: values right at the threshold are still "good"', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/', 'scroll');
    ana.vitals('/', { lcpMs: 2500, cls: 0.1, inpMs: 200 });

    expect(performance(run)).toEqual([]);
  });

  it('does not fire on a step without measurements', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/', 'scroll');
    ana.vitals('/', {});

    expect(performance(run)).toEqual([]);
  });
});
