import { describe, expect, it } from 'vitest';

import { ATTACK_ANGLE, chapterAt, DEFENSE_ANGLE, latheAngle, turnProgress } from './lathe';

describe('the lathe', () => {
  it('rests on the attack face, turns half a turn, rests on the defense face', () => {
    expect(latheAngle(0)).toBeCloseTo(ATTACK_ANGLE);
    expect(latheAngle(0.2)).toBeCloseTo(ATTACK_ANGLE);
    expect(latheAngle(0.5)).toBeCloseTo(ATTACK_ANGLE + Math.PI / 2);
    expect(DEFENSE_ANGLE - ATTACK_ANGLE).toBeCloseTo(Math.PI);
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

  it('turns each face right, towards the text, nearly in profile', () => {
    // +X after a turn of θ is (cos θ, 0, -sin θ): right is +X, towards the camera is +Z.
    expect(Math.cos(ATTACK_ANGLE)).toBeGreaterThan(0.98);
    expect(-Math.sin(ATTACK_ANGLE)).toBeGreaterThan(0);
    // -X after a turn of θ is (-cos θ, 0, sin θ).
    expect(-Math.cos(DEFENSE_ANGLE)).toBeGreaterThan(0.98);
    expect(Math.sin(DEFENSE_ANGLE)).toBeGreaterThan(0);
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
