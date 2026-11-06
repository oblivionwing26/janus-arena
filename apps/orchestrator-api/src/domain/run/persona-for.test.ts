import { describe, expect, it } from 'vitest';

import { personaFor } from './persona-for.js';

const plan = { runId: 'r', variantId: 'v', baseUrl: 'http://x', sessions: 3 };

describe('personaFor', () => {
  it('plays the personas in turn', () => {
    const withPersonas = { ...plan, personas: ['ana', 'luis'] };
    expect([0, 1, 2].map((index) => personaFor(withPersonas, index))).toEqual([
      'ana',
      'luis',
      'ana',
    ]);
  });

  it('is the scripted agent when the run has no personas', () => {
    expect(personaFor(plan, 0)).toBeUndefined();
    expect(personaFor({ ...plan, personas: [] }, 0)).toBeUndefined();
  });
});
