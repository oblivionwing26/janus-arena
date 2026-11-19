import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PALETTE, TEXT_TOKENS, contrastRatio, oklchCss, relativeLuminance } from './palette';

const tokensCss = readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8');

describe('palette', () => {
  it('matches the WCAG reference values for black and white', () => {
    expect(relativeLuminance([1, 0, 0])).toBeCloseTo(1, 3);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 6);
    expect(contrastRatio([1, 0, 0], [0, 0, 0])).toBeCloseTo(21, 1);
  });

  it.each(Object.entries(PALETTE))(
    'tokens.css declares --%s with the same value',
    (name, value) => {
      expect(tokensCss).toContain(`--${name}: ${oklchCss(value)};`);
    },
  );

  it.each(TEXT_TOKENS)('--%s reaches AA (4.5:1) on the page and on a surface', (name) => {
    expect(contrastRatio(PALETTE[name], PALETTE.void)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PALETTE[name], PALETTE.ash)).toBeGreaterThanOrEqual(4.5);
  });
});
