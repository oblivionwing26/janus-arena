// The lathe: as the reader scrolls, the scanned Janus turns on its vertical axis from the face that
// attacks to the face that defends. Pure: scroll progress in, angle and chapter out.
//
// The bust's bearded face looks along +X and the young one along -X (three.js axes); the camera
// looks down -Z. A turn of θ around Y sends +X to (cos θ, 0, -sin θ), so the bearded face shows in
// three-quarter view at θ = -55°, both profiles show at 0°, and the young face at +55°.

export const ATTACK_ANGLE = (-55 * Math.PI) / 180;
export const DEFENSE_ANGLE = (55 * Math.PI) / 180;

/** The turn happens in this slice of the section's scroll; before and after, the head rests. */
export const TURN_FROM = 0.34;
export const TURN_TO = 0.66;

export type Chapter = 'attack' | 'turn' | 'defense';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** How far through the turn the head is (0: attack face, 1: defense face). */
export function turnProgress(progress: number): number {
  return smooth(clamp((clamp(progress) - TURN_FROM) / (TURN_TO - TURN_FROM)));
}

/** The head's angle around its vertical axis, in radians. */
export function latheAngle(progress: number): number {
  return ATTACK_ANGLE + (DEFENSE_ANGLE - ATTACK_ANGLE) * turnProgress(progress);
}

/** Which chapter the text column shows. */
export function chapterAt(progress: number): Chapter {
  const t = turnProgress(progress);
  if (t <= 0.12) return 'attack';
  if (t >= 0.88) return 'defense';
  return 'turn';
}
