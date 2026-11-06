// F1.8 "Done when": reference values to 3 decimals. Wilson is also checked by hand; every other
// number comes from reference/reference.py, an independent Python (stdlib only) implementation.

import { describe, expect, it } from 'vitest';

import { pairedBootstrap, quantile } from './bootstrap.js';
import { decide } from './decide.js';
import { mulberry32 } from './rng.js';
import { wilsonInterval, Z95 } from './wilson.js';

const r3 = (value: number) => Math.round(value * 1000) / 1000;

describe('mulberry32', () => {
  it('produces the same stream as the Python reference', () => {
    const next = mulberry32(20261106);
    expect(Array.from({ length: 5 }, next)).toEqual([
      0.01353957294486463, 0.8884504192974418, 0.7106646823231131, 0.18516792636364698,
      0.8750997642055154,
    ]);
  });

  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = Array.from({ length: 1000 }, mulberry32(7));
    expect(Array.from({ length: 1000 }, mulberry32(7))).toEqual(a);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(Array.from({ length: 5 }, mulberry32(8))).not.toEqual(a.slice(0, 5));
  });
});

describe('wilsonInterval', () => {
  it('uses the exact 97.5 % normal quantile', () => {
    expect(Z95).toBeCloseTo(1.9599639845400536, 15);
  });

  // By hand for 8/10: p = 0.8, z² = 3.8415, denominator 1.38415,
  // centre (0.8 + 0.19207) / 1.38415 = 0.71674, half-width 1.96 × 0.16001 / 1.38415 = 0.22657.
  it.each([
    [8, 10, 0.49, 0.943],
    [0, 20, 0, 0.161],
    [1, 1, 0.207, 1],
    [5, 10, 0.237, 0.763],
    [45, 50, 0.786, 0.957],
    [3, 4, 0.301, 0.954],
  ])('%i/%i is [%f, %f]', (successes, n, low, high) => {
    const interval = wilsonInterval(successes, n);
    expect([r3(interval.low), r3(interval.high)]).toEqual([low, high]);
    expect(interval.rate).toBeCloseTo(successes / n, 12);
  });

  it('rejects impossible counts', () => {
    expect(() => wilsonInterval(0, 0)).toThrow(RangeError);
    expect(() => wilsonInterval(3, 2)).toThrow(RangeError);
    expect(() => wilsonInterval(-1, 2)).toThrow(RangeError);
    expect(() => wilsonInterval(1.5, 2)).toThrow(RangeError);
  });
});

describe('pairedBootstrap', () => {
  it.each([
    ['mixed12', [1, 0, 0, 1, -1, 0, 1, 0, 0, 1, 0, -1], 0.167, -0.25, 0.583],
    ['allzero8', [0, 0, 0, 0, 0, 0, 0, 0], 0, 0, 0],
    ['positive10', [1, 1, 0, 1, 0, 1, 1, 0, 1, 0], 0.6, 0.3, 0.9],
    ['aa4', [0, 0, 0, 0], 0, 0, 0],
  ])('%s matches the Python reference', (_name, differences, mean, low, high) => {
    const result = pairedBootstrap(differences);
    expect([r3(result.mean), r3(result.low), r3(result.high)]).toEqual([mean, low, high]);
    expect(result.resamples).toBe(10_000);
  });

  it('gives the same interval for the same seed, and may differ for another', () => {
    const differences = [1, 0, 0, 1, -1, 0, 1, 0, 0, 1, 0, -1];
    expect(pairedBootstrap(differences)).toEqual(pairedBootstrap(differences));
    expect(pairedBootstrap(differences, { seed: 1 }).seed).toBe(1);
  });

  it('approaches the exact bootstrap distribution of a small sample', () => {
    // For [1, 0, -1] (n = 3) the resampled mean is (#1 − #-1) / 3, with probabilities out of 27:
    // -1 → 1, -2/3 → 3, -1/3 → 6, 0 → 7, 1/3 → 6, 2/3 → 3, 1 → 1. P(mean = -1) = 3.7 % > 2.5 %, so
    // the exact 2.5 % quantile is -1 and, by symmetry, the 97.5 % one is 1; the mean is 0.
    const result = pairedBootstrap([1, 0, -1], { resamples: 20_000 });
    expect([result.low, result.high, result.mean]).toEqual([-1, 1, 0]);
    // At 90 % the 5 % quantile lies past -1 (3.7 % cumulative) on -2/3 (14.8 % cumulative).
    const ninety = pairedBootstrap([1, 0, -1], { resamples: 20_000, level: 0.9 });
    expect(ninety.low).toBe(-2 / 3);
  });

  it('rejects an empty sample and non-positive resamples', () => {
    expect(() => pairedBootstrap([])).toThrow(RangeError);
    expect(() => pairedBootstrap([1], { resamples: 0 })).toThrow(RangeError);
  });
});

describe('quantile', () => {
  it('interpolates linearly between order statistics', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });
});

describe('decide', () => {
  it('says "no detectable difference" when the interval of B − A contains 0', () => {
    expect(decide({ low: -0.25, high: 0.583 })).toBe('no-detectable-difference');
    expect(decide({ low: 0, high: 0 })).toBe('no-detectable-difference');
    expect(decide({ low: 0, high: 0.4 })).toBe('no-detectable-difference');
  });

  it('names a direction only when the whole interval is on one side', () => {
    expect(decide({ low: 0.3, high: 0.9 })).toBe('b-higher');
    expect(decide({ low: -0.6, high: -0.1 })).toBe('b-lower');
  });
});
