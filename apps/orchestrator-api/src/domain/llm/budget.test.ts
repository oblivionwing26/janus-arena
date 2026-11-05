import type { EventCost } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Budget } from './budget.js';
import { BudgetExhaustedError } from './budget-exhausted-error.js';

function cost(tokens: number, eur: number): EventCost {
  return {
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    estimatedEur: eur,
  };
}

describe('Budget', () => {
  it('starts ok with nothing used', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });

    expect(budget.state).toBe('ok');
    expect(budget.usedTokens).toBe(0);
    expect(budget.usedEur).toBe(0);
  });

  it('rejects non-positive limits', () => {
    expect(() => new Budget({ maxTokens: 0, maxEur: 1 })).toThrow(RangeError);
    expect(() => new Budget({ maxTokens: 10, maxEur: -1 })).toThrow(RangeError);
  });

  it('counts every token kind towards the token limit', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });

    budget.charge({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 30,
      cacheCreationInputTokens: 20,
      estimatedEur: 0,
    });

    expect(budget.usedTokens).toBe(200);
  });

  it('stays ok just below 80 % and warns when a charge reaches it', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });

    expect(budget.charge(cost(799, 0))).toEqual({ previous: 'ok', current: 'ok' });
    expect(budget.charge(cost(1, 0))).toEqual({ previous: 'ok', current: 'warning' });
  });

  it('warns at 80 % of euros even if tokens are low', () => {
    const budget = new Budget({ maxTokens: 1_000_000, maxEur: 1 });

    expect(budget.charge(cost(10, 0.8)).current).toBe('warning');
  });

  it('becomes exhausted on the charge that reaches 100 %', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });
    budget.charge(cost(900, 0));

    expect(budget.charge(cost(150, 0))).toEqual({ previous: 'warning', current: 'exhausted' });
    expect(budget.usedTokens).toBe(1050);
  });

  it('can jump straight from ok to exhausted', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });

    expect(budget.charge(cost(10, 1.2))).toEqual({ previous: 'ok', current: 'exhausted' });
  });

  it('refuses new spending only once exhausted', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });
    budget.charge(cost(850, 0));
    expect(() => {
      budget.assertCanSpend();
    }).not.toThrow();

    budget.charge(cost(200, 0));

    expect(() => {
      budget.assertCanSpend();
    }).toThrow(BudgetExhaustedError);
  });

  it('exposes a snapshot for budget events', () => {
    const budget = new Budget({ maxTokens: 1000, maxEur: 2 });
    budget.charge(cost(100, 0.5));

    expect(budget.snapshot()).toEqual({
      state: 'ok',
      usedTokens: 100,
      usedEur: 0.5,
      maxTokens: 1000,
      maxEur: 2,
    });
  });
});
