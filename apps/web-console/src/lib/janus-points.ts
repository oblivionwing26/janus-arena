// The Janus point cloud (public/models/janus-points.bin, written by assets/janus/export.py):
// uint32 N, then N*3 int16 positions (metres / 1.5 * 32767), then N*3 int8 normals (* 127).

export const POSITION_SCALE = 1.5;

export interface JanusPoints {
  count: number;
  positions: Float32Array;
  normals: Float32Array;
}

export function decodeJanusPoints(buffer: ArrayBuffer): JanusPoints {
  if (buffer.byteLength < 4) throw new Error('Janus points: file too short');
  const count = new DataView(buffer).getUint32(0, true);
  const expected = 4 + count * 6 + count * 3;
  if (count === 0 || buffer.byteLength !== expected) {
    throw new Error(
      `Janus points: expected ${expected} bytes for ${count} points, got ${buffer.byteLength}`,
    );
  }
  const rawPositions = new Int16Array(buffer.slice(4, 4 + count * 6));
  const rawNormals = new Int8Array(buffer, 4 + count * 6, count * 3);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    positions[i] = ((rawPositions[i] ?? 0) / 32767) * POSITION_SCALE;
    normals[i] = (rawNormals[i] ?? 0) / 127;
  }
  return { count, positions, normals };
}

/**
 * How far the head has turned, from the hero's scroll progress (0 at the top, 1 when the hero
 * has scrolled away). It starts in the coin view, both profiles side by side, and turns
 * towards the old face (security) as the page moves on; radians around the vertical axis.
 */
export function turnForScroll(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const eased = p * p * (3 - 2 * p);
  return 0.75 * eased;
}

/** Exponential approach of `current` to `target`, frame-rate independent. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
