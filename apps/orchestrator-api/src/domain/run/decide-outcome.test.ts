import { describe, expect, it } from 'vitest';

import { decideOutcome } from './decide-outcome.js';

describe('decideOutcome', () => {
  it('is success when every session completed', () => {
    expect(
      decideOutcome([
        { sessionIndex: 0, status: 'completed' },
        { sessionIndex: 1, status: 'completed' },
      ]),
    ).toEqual({ outcome: 'success' });
  });

  it('is budget_exhausted as soon as one session ran out of budget', () => {
    expect(
      decideOutcome([
        { sessionIndex: 0, status: 'completed' },
        { sessionIndex: 1, status: 'budget_exhausted' },
      ]).outcome,
    ).toBe('budget_exhausted');
  });

  it('is error otherwise, with a count per status', () => {
    expect(
      decideOutcome([
        { sessionIndex: 0, status: 'completed' },
        { sessionIndex: 1, status: 'failed' },
        { sessionIndex: 2, status: 'infra_error' },
      ]),
    ).toEqual({ outcome: 'error', reason: '1/3 sessions completed; failed: 1; infra_error: 1' });
  });

  it('is error for a run with no sessions', () => {
    expect(decideOutcome([]).outcome).toBe('error');
  });
});
