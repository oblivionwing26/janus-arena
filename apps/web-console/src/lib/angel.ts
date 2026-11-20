// The hero's angel, drawn in points: two wings of feathers and a burning halo around the scanned
// Janus. Pure and seeded, so the same figure comes out on every load and in the tests. Positions
// are in scene units (the head's centre near y = 0.6, the camera on +Z); colours are linear RGB.

export type Side = -1 | 1;

export interface Cloud {
  positions: Float32Array;
  colors: Float32Array;
}

/** The attacking face's colour and the defending face's, as RGB triples in 0..1. */
export const WARM: readonly [number, number, number] = [1, 0.36, 0.2];
export const COOL: readonly [number, number, number] = [0.36, 0.94, 0.78];

/** A small seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: readonly number[], b: readonly number[], t: number) =>
  [0, 1, 2].map((i) => (a[i] ?? 0) * (1 - t) + (b[i] ?? 0) * t);

/** Which colour each side of the figure takes: the attacking face looks left (side -1). */
export const sideColor = (side: Side) => (side === -1 ? WARM : COOL);

export const FEATHERS = 48;
export const POINTS_PER_FEATHER = 420;

/**
 * One wing, raised and arched like the reference: feathers hang from the arm, short and steep at
 * the shoulder, long and swept out at the wrist, with a row of short coverts over their roots.
 * Positions are relative to the shoulder, so the wing can beat around it.
 */
export function wing(side: Side, random: () => number): Cloud {
  const n = FEATHERS * POINTS_PER_FEATHER;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const tint = sideColor(side);
  // the arm: a quadratic curve from the shoulder up and out to the wrist
  const elbow = [1.25 * side, 1.45, -0.2];
  const wrist = [2.75 * side, 1.75, -0.35];
  let k = 0;
  for (let f = 0; f < FEATHERS; f++) {
    const u = f / (FEATHERS - 1);
    const base = [0, 1, 2].map((i) => 2 * (1 - u) * u * (elbow[i] ?? 0) + u * u * (wrist[i] ?? 0));
    // down and a little out at the shoulder, swept far out at the wrist (outwards is +X·side)
    const angle = -Math.PI / 2 + side * (0.3 + 0.95 * u * u);
    const dir = [Math.cos(angle), Math.sin(angle)];
    const normal = [-(dir[1] ?? 0), dir[0] ?? 0];
    const covert = f % 2 === 1;
    const length = covert ? 0.45 + 0.65 * u : 0.9 + 2.1 * u;
    const width = 0.2 + 0.14 * u;
    for (let p = 0; p < POINTS_PER_FEATHER; p++, k++) {
      const t = Math.pow(random(), 0.8);
      const spread = (random() - 0.5) * width * Math.sin(Math.PI * Math.min(1, t * 1.15));
      const x = (base[0] ?? 0) + (dir[0] ?? 0) * length * t + (normal[0] ?? 0) * spread;
      const y = (base[1] ?? 0) + (dir[1] ?? 0) * length * t + (normal[1] ?? 0) * spread;
      const z = (base[2] ?? 0) - 0.25 * t * u + (covert ? 0.06 : 0) + (random() - 0.5) * 0.04;
      positions.set([x, y, z], k * 3);
      // lit along the arm, fading towards the tips, which take the side's colour
      const light = (0.45 + 0.55 * (1 - t)) * (0.55 + 0.45 * random());
      const c = mix([1, 1, 1], tint, 0.15 + 0.6 * t * u);
      colors.set([(c[0] ?? 0) * light, (c[1] ?? 0) * light, (c[2] ?? 0) * light], k * 3);
    }
  }
  return { positions, colors };
}

export const HALO_POINTS = 3600;

/**
 * The halo: a ring behind the head that burns warm on the attacking side and cool on the
 * defending one, with a few sparks thrown off its edge.
 */
export function halo(radius: number, random: () => number): Cloud {
  const positions = new Float32Array(HALO_POINTS * 3);
  const colors = new Float32Array(HALO_POINTS * 3);
  for (let k = 0; k < HALO_POINTS; k++) {
    const a = random() * Math.PI * 2;
    const spark = random() < 0.08;
    const r = radius + (random() - 0.5) * (spark ? 0.35 : 0.035);
    positions.set([Math.cos(a) * r, Math.sin(a) * r, (random() - 0.5) * 0.03], k * 3);
    // cos(a) < 0 is the left, attacking side
    const c = mix(WARM, COOL, (Math.cos(a) + 1) / 2);
    const light = spark ? 0.5 * random() : 0.85 + 0.15 * random();
    const white = Math.max(0, Math.sin(a)) * 0.35;
    colors.set(
      [0, 1, 2].map((i) => ((c[i] ?? 0) * (1 - white) + white) * light),
      k * 3,
    );
  }
  return { positions, colors };
}

export const EMBERS = 420;

/** Embers that rise past the figure; the scene moves them, this places them at the start. */
export function embers(random: () => number): Cloud {
  const positions = new Float32Array(EMBERS * 3);
  const colors = new Float32Array(EMBERS * 3);
  for (let k = 0; k < EMBERS; k++) {
    const x = (random() - 0.5) * 7;
    positions.set([x, -2.4 + random() * 4.8, (random() - 0.5) * 2], k * 3);
    const c = sideColor(x < 0 ? -1 : 1);
    const light = 0.4 + 0.6 * random();
    colors.set([(c[0] ?? 0) * light, (c[1] ?? 0) * light, (c[2] ?? 0) * light], k * 3);
  }
  return { positions, colors };
}
