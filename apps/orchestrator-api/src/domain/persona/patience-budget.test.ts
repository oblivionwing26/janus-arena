import { describe, expect, it } from 'vitest';

import { InvalidPersonaError } from './invalid-persona-error.js';
import { PatienceBudget } from './patience-budget.js';

describe('PatienceBudget', () => {
  const budget = new PatienceBudget({ maxSteps: 20, maxSeconds: 120 });

  it('lasts while both steps and time remain', () => {
    expect(budget.isExhausted({ steps: 19, elapsedMs: 119_999 })).toBe(false);
  });

  it('runs out at the step limit or at the time limit, whichever comes first', () => {
    expect(budget.isExhausted({ steps: 20, elapsedMs: 0 })).toBe(true);
    expect(budget.isExhausted({ steps: 0, elapsedMs: 120_000 })).toBe(true);
  });

  it.each([
    [{ maxSteps: 0, maxSeconds: 60 }],
    [{ maxSteps: 2.5, maxSeconds: 60 }],
    [{ maxSteps: 201, maxSeconds: 60 }],
    [{ maxSteps: 10, maxSeconds: 5 }],
    [{ maxSteps: 10, maxSeconds: 3601 }],
  ])('rejects %j', (limits) => {
    expect(() => new PatienceBudget(limits)).toThrow(InvalidPersonaError);
  });
});
