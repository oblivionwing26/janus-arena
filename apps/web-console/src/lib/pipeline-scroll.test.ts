import { describe, expect, it } from 'vitest';

import { stationAt } from './pipeline-scroll';

describe('stationAt', () => {
  it('splits the scroll into equal slices, one per station', () => {
    expect(stationAt(0, 8)).toBe(0);
    expect(stationAt(0.124, 8)).toBe(0);
    expect(stationAt(0.125, 8)).toBe(1);
    expect(stationAt(0.99, 8)).toBe(7);
  });

  it('clamps outside the section and at the very end', () => {
    expect(stationAt(-1, 8)).toBe(0);
    expect(stationAt(1, 8)).toBe(7);
    expect(stationAt(4, 8)).toBe(7);
    expect(stationAt(0.5, 0)).toBe(0);
  });
});
