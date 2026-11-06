// The statistics of the real A/A run of F1.7 (runs/ab-demo.yaml: ShopLab main against itself,
// 4 personas × 1 seed + a baseline per variant). Only its session events are kept as a fixture.
// A/A must read as "no detectable difference"; the numbers are the Python reference's 3/4 and
// aa4 cases.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseRunExport } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { abSummary } from './ab-summary.js';

const { events } = parseRunExport(
  readFileSync(fileURLToPath(new URL('../fixtures/aa-run-f17.json', import.meta.url)), 'utf8'),
);
const r3 = (value: number | undefined) =>
  value === undefined ? undefined : Math.round(value * 1000) / 1000;

describe('the A/A run of F1.7', () => {
  const summary = abSummary(events);

  it('rates both variants the same: 3 of 4 personas, Wilson [0.301, 0.954]', () => {
    expect(
      summary.variants.map((variant) => [
        variant.variant,
        variant.personas?.successes,
        variant.personas?.n,
        r3(variant.personas?.low),
        r3(variant.personas?.high),
      ]),
    ).toEqual([
      ['a', 3, 4, 0.301, 0.954],
      ['b', 3, 4, 0.301, 0.954],
    ]);
  });

  it('keeps the competent baseline apart: it succeeded on both variants', () => {
    expect(summary.variants.map((variant) => variant.baseline)).toEqual([
      { successes: 1, n: 1 },
      { successes: 1, n: 1 },
    ]);
  });

  it('finds no detectable difference between A and A', () => {
    expect(summary.comparison).toMatchObject({
      a: 'a',
      b: 'b',
      pairs: 4,
      verdict: 'no-detectable-difference',
    });
    const difference = summary.comparison?.difference;
    expect([r3(difference?.mean), r3(difference?.low), r3(difference?.high)]).toEqual([0, 0, 0]);
    expect(summary.excluded).toEqual([]);
  });
});
