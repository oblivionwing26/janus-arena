import { describe, expect, it } from 'vitest';

import { ATTACK_ANGLE, chapterAt, DEFENSE_ANGLE, latheAngle, turnProgress } from './lathe';

describe('the lathe', () => {
  it('rests on the attack face, turns through both profiles, rests on the defense face', () => {
    expect(latheAngle(0)).toBeCloseTo(ATTACK_ANGLE);
    expect(latheAngle(0.2)).toBeCloseTo(ATTACK_ANGLE);
    expect(latheAngle(0.5)).toBeCloseTo(0);
    expect(latheAngle(0.8)).toBeCloseTo(DEFENSE_ANGLE);
    expect(latheAngle(1)).toBeCloseTo(DEFENSE_ANGLE);
  });

  it('turns one way only, never back', () => {
    let last = -Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const a = latheAngle(p);
      expect(a).toBeGreaterThanOrEqual(last - 1e-12);
      last = a;
    }
  });

  it('shows the bearded face in three-quarter view first and the young one last', () => {
    // +X after a turn of θ is (cos θ, 0, -sin θ); towards the camera (+Z) means -sin θ > 0.
    expect(-Math.sin(ATTACK_ANGLE)).toBeGreaterThan(0.5);
    // -X after a turn of θ is (-cos θ, 0, sin θ).
    expect(Math.sin(DEFENSE_ANGLE)).toBeGreaterThan(0.5);
  });

  it('names the chapter for the text column, clamping outside the section', () => {
    expect(chapterAt(-1)).toBe('attack');
    expect(chapterAt(0.1)).toBe('attack');
    expect(chapterAt(0.5)).toBe('turn');
    expect(chapterAt(0.9)).toBe('defense');
    expect(chapterAt(3)).toBe('defense');
    expect(turnProgress(0.5)).toBeCloseTo(0.5);
  });
});
