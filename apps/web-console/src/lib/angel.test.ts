import { describe, expect, it } from 'vitest';

import {
  EMBERS,
  FEATHERS,
  HALO_POINTS,
  POINTS_PER_FEATHER,
  WARM,
  COOL,
  embers,
  halo,
  rng,
  wing,
} from './angel';

const xs = (a: Float32Array) => a.filter((_, i) => i % 3 === 0);

describe('the hero angel', () => {
  it('draws the same figure from the same seed', () => {
    expect(wing(-1, rng(7)).positions).toEqual(wing(-1, rng(7)).positions);
    expect(wing(-1, rng(7)).positions).not.toEqual(wing(-1, rng(8)).positions);
  });

  it('spreads each wing out on its own side and keeps colours in range', () => {
    for (const side of [-1, 1] as const) {
      const { positions, colors } = wing(side, rng(1));
      expect(positions.length).toBe(FEATHERS * POINTS_PER_FEATHER * 3);
      const out = xs(positions).map((x) => x * side);
      expect(Math.max(...out)).toBeGreaterThan(2.5);
      expect(Math.min(...out)).toBeGreaterThan(-0.5);
      expect(Math.min(...colors)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...colors)).toBeLessThanOrEqual(1);
    }
  });

  it('burns warm on the left of the halo and cool on the right', () => {
    const { positions, colors } = halo(1, rng(3));
    expect(positions.length).toBe(HALO_POINTS * 3);
    const red = (side: number) => {
      let sum = 0;
      let n = 0;
      for (let k = 0; k < HALO_POINTS; k++) {
        if (Math.sign(positions[k * 3] ?? 0) === side) {
          sum += (colors[k * 3] ?? 0) - (colors[k * 3 + 1] ?? 0);
          n++;
        }
      }
      return sum / n;
    };
    expect(red(-1)).toBeGreaterThan(0);
    expect(red(1)).toBeLessThan(0);
    expect(WARM[0]).toBeGreaterThan(WARM[1]);
    expect(COOL[1]).toBeGreaterThan(COOL[0]);
  });

  it('places every ember inside the frame', () => {
    const { positions } = embers(rng(5));
    expect(positions.length).toBe(EMBERS * 3);
    for (const x of xs(positions)) expect(Math.abs(x)).toBeLessThanOrEqual(3.5);
  });
});
