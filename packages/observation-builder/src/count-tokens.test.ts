import { describe, expect, it } from 'vitest';

import { estimateTokens } from './count-tokens.js';

describe('estimateTokens', () => {
  it('is zero for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up at three characters per token (conservative for Spanish UI text)', () => {
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(2);
    expect(estimateTokens('[e1] button "Añadir al carrito"')).toBe(11);
  });

  it('counts characters, not UTF-16 code units', () => {
    expect(estimateTokens('€€€')).toBe(1);
    expect(estimateTokens('😀😀😀')).toBe(1);
  });
});
