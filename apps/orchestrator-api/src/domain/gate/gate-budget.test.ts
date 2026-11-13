import { describe, expect, it } from 'vitest';

import { GateBudget } from './gate-budget.js';
import { InvalidGateBudgetError } from './invalid-gate-budget-error.js';

describe('GateBudget (F3.9)', () => {
  const budget = new GateBudget(2, { 'synthlab-a': 0.25, 'variant-b': 0.25, 'blue-team': 0.5 });

  it('gives each stage its share of the total', () => {
    expect(budget.allowance('synthlab-a', 0)).toBeCloseTo(0.5);
  });

  it('carries what an earlier stage left to the next ones', () => {
    // synthlab-a spent 0.1 of its 0.5: variant-b gets its own 0.5 plus the 0.4 left.
    expect(budget.allowance('variant-b', 0.1)).toBeCloseTo(0.9);
    // A deterministic stage with no share gets only what is left over so far.
    expect(budget.allowance('red-team', 0.6)).toBeCloseTo(0.4);
    expect(budget.allowance('blue-team', 0.6)).toBeCloseTo(1.4);
  });

  it('never gives more than what is left of the total', () => {
    expect(budget.allowance('blue-team', 1.9)).toBeCloseTo(0.1);
    expect(budget.allowance('blue-team', 2.5)).toBe(0);
    expect(budget.remaining(2.5)).toBe(0);
  });

  it('gives nothing to a stage when the earlier ones overspent their shares', () => {
    expect(budget.allowance('variant-b', 1.2)).toBe(0);
  });

  it('refuses shares over the total and a total that is not positive', () => {
    expect(() => new GateBudget(1, { ab: 0.7, 'blue-team': 0.5 })).toThrow(InvalidGateBudgetError);
    expect(() => new GateBudget(0, {})).toThrow(InvalidGateBudgetError);
    expect(() => new GateBudget(1, { ab: -0.1 })).toThrow(InvalidGateBudgetError);
  });
});
