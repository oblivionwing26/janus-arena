import { describe, expect, it } from 'vitest';

import { costOf } from './cost.js';
import { ReportRun } from './test-support/report-run.js';

describe('costOf', () => {
  it('adds up every cost and splits it by model role', () => {
    const run = new ReportRun();
    const persona = run.session('carmen-a-s1-a1');
    persona.llmCall(0.0002, { input: 543, output: 217, read: 2111, write: 178 });
    persona.llmCall(0.0001, { input: 500, output: 200, read: 2000 });
    const baseline = run.session('competent-baseline-a-s1-a1', { kind: 'baseline' });
    baseline.llmCall(0.003, { input: 639, output: 166, read: 2157, write: 83 });

    const cost = costOf(run.events());

    // Hand sums: 543 + 500 + 639, 217 + 200 + 166, 2111 + 2000 + 2157, 178 + 83.
    expect(cost).toMatchObject({
      calls: 3,
      inputTokens: 1682,
      outputTokens: 583,
      cacheReadInputTokens: 6268,
      cacheCreationInputTokens: 261,
    });
    expect(cost.estimatedEur).toBeCloseTo(0.0033, 10);
    expect(cost.byRole.map((role) => [role.role, role.calls])).toEqual([
      ['competent-baseline', 1],
      ['navigator', 2],
    ]);
    expect(cost.byRole[1]?.estimatedEur).toBeCloseTo(0.0003, 10);
  });

  it('is zero for a run without LLM calls', () => {
    expect(costOf([])).toEqual({
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      estimatedEur: 0,
      byRole: [],
    });
  });
});
