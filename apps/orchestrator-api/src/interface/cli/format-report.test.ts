import { synthlabReportSchema } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { formatReport } from './format-report.js';

const report = synthlabReportSchema.parse({
  format: 'janus-synthlab-report',
  version: 1,
  runId: '01JC0F110FM0000000000000AA',
  source: { events: 40, lastSeq: 39 },
  sessions: { persona: 2, baseline: 1, excluded: [] },
  funnel: [
    {
      variant: 'a',
      sessions: 2,
      steps: [
        { name: 'Inicio', route: '/', reached: 2, rate: 1 },
        { name: 'Carrito', route: '/cart', reached: 1, rate: 0.5 },
      ],
    },
  ],
  zones: [
    {
      rank: 1,
      route: '/register',
      element: 'role=button[name="Crear cuenta"]',
      intensity: 4,
      signals: 3,
      sessions: 2,
      detectors: [{ detector: 'form-error', signals: 3 }],
      boxes: [],
      screenshot: null,
      evidenceEventIds: [],
    },
    {
      rank: 2,
      route: '/checkout',
      element: null,
      intensity: 1,
      signals: 1,
      sessions: 1,
      detectors: [{ detector: 'backtrack', signals: 1 }],
      boxes: [],
      screenshot: null,
      evidenceEventIds: [],
    },
  ],
  detectors: [{ detector: 'form-error', signals: 3, sessions: 2 }],
  success: {
    variants: [
      {
        variant: 'a',
        personas: { rate: 0.5, low: 0.0945, high: 0.9055, successes: 1, n: 2 },
        baseline: { successes: 1, n: 1 },
      },
    ],
    comparison: null,
  },
  cost: {
    calls: 3,
    inputTokens: 1,
    outputTokens: 1,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    estimatedEur: 0.0123,
    byRole: [{ role: 'navigator', calls: 3, estimatedEur: 0.0123 }],
  },
});

describe('formatReport', () => {
  it('lists the zones, the funnel, the success rates and the cost', () => {
    const text = formatReport(report);

    expect(text).toContain(
      ' 1. /register role=button[name="Crear cuenta"]: intensity 4, 2 sessions; form-error ×3',
    );
    expect(text).toContain(' 2. /checkout (page): intensity 1, 1 sessions; backtrack ×1');
    expect(text).toContain('a (2): Inicio 2 (100 %) → Carrito 1 (50 %)');
    expect(text).toContain('a: personas 1/2 = 50 % [9 %, 91 %]; baseline 1/1');
    expect(text).toContain('Cost: 0.0123 € in 3 LLM calls');
    expect(text).not.toContain('Top zones on variant');
  });

  it('lists the top zones of each variant when there are two', () => {
    const [first, second] = report.zones;
    const text = formatReport({
      ...report,
      zonesByVariant: [
        { variant: 'a', zones: first === undefined ? [] : [first] },
        { variant: 'b', zones: second === undefined ? [] : [{ ...second, rank: 1 }] },
      ],
    });

    expect(text).toContain('Top zones on variant a:\n   1. /register');
    expect(text).toContain(
      'Top zones on variant b:\n   1. /checkout (page): intensity 1, 1 sessions',
    );
  });
});
