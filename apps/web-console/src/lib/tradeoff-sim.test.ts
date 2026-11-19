import { describe, expect, it } from 'vitest';

import { createSim, liveRates, setDefense, step, type Sim } from './tradeoff-sim';

const RATES = { attackPassWithDefense: 0, shopperBlockWithDefense: 0.18, attackerShare: 0.25 };

function run(sim: Sim, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) step(sim, 1 / 60);
}

describe('tradeoff simulation', () => {
  it('without the defense, every attacker gets through and no shopper is turned away', () => {
    const sim = createSim(RATES, 1);
    run(sim, 60);
    expect(liveRates(sim)).toEqual({ attacksThrough: 100, shoppersBlocked: 0 });
  });

  it('with the defense, no attacker gets through and about 18 % of shoppers are turned away', () => {
    const blocked: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = createSim(RATES, seed);
      setDefense(sim, true);
      run(sim, 90);
      const r = liveRates(sim);
      expect(r.attacksThrough).toBe(0);
      blocked.push(r.shoppersBlocked ?? -1);
    }
    const mean = blocked.reduce((a, b) => a + b, 0) / blocked.length;
    expect(mean).toBeGreaterThan(12);
    expect(mean).toBeLessThan(24);
  });

  it('switching the defense starts the counts afresh', () => {
    const sim = createSim(RATES, 3);
    run(sim, 30);
    setDefense(sim, true);
    expect(liveRates(sim)).toEqual({ attacksThrough: null, shoppersBlocked: null });
  });

  it('reads as unknown until there are enough outcomes to mean something', () => {
    const sim = createSim(RATES, 4);
    setDefense(sim, true);
    run(sim, 1.5);
    expect(liveRates(sim).shoppersBlocked).toBeNull();
  });

  it('is reproducible for a seed', () => {
    const a = createSim(RATES, 9);
    const b = createSim(RATES, 9);
    run(a, 20);
    run(b, 20);
    expect(a.walkers.map((w) => [w.kind, w.x])).toEqual(b.walkers.map((w) => [w.kind, w.x]));
  });

  it('keeps the walker list bounded', () => {
    const sim = createSim(RATES, 5);
    setDefense(sim, true);
    run(sim, 400);
    expect(sim.walkers.length).toBeLessThan(80);
  });
});
