import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { damp, decodeJanusPoints, nextPixelRatio, turnForScroll } from './janus-points';

function encode(points: [number, number, number, number, number, number][]): ArrayBuffer {
  const n = points.length;
  const buf = new ArrayBuffer(4 + n * 9);
  new DataView(buf).setUint32(0, n, true);
  const pos = new Int16Array(buf, 4, n * 3);
  const nor = new Int8Array(buf, 4 + n * 6, n * 3);
  points.forEach(([x, y, z, nx, ny, nz], i) => {
    pos.set(
      [x, y, z].map((v) => Math.round((v / 1.5) * 32767)),
      i * 3,
    );
    nor.set(
      [nx, ny, nz].map((v) => Math.round(v * 127)),
      i * 3,
    );
  });
  return buf;
}

describe('decodeJanusPoints', () => {
  it('decodes positions and normals', () => {
    const p = decodeJanusPoints(encode([[0.75, -1.2, 0, 0, 1, 0]]));
    expect(p.count).toBe(1);
    expect(p.positions[0]).toBeCloseTo(0.75, 4);
    expect(p.positions[1]).toBeCloseTo(-1.2, 4);
    expect(p.normals[1]).toBeCloseTo(1, 4);
  });

  it('rejects a file whose length does not match its count', () => {
    const buf = encode([[0, 0, 0, 1, 0, 0]]);
    expect(() => decodeJanusPoints(buf.slice(0, buf.byteLength - 1))).toThrow(/expected/);
    expect(() => decodeJanusPoints(new ArrayBuffer(2))).toThrow(/too short/);
  });

  it('reads the shipped cloud: 40 000 points inside the head, with unit normals', () => {
    const file = readFileSync(new URL('../../public/models/janus-points.bin', import.meta.url));
    const p = decodeJanusPoints(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    );
    expect(p.count).toBe(40000);
    let maxX = 0;
    for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, Math.abs(p.positions[i * 3] ?? 0));
    expect(maxX).toBeGreaterThan(0.9);
    expect(maxX).toBeLessThan(1.2);
    const [nx = 0, ny = 0, nz = 0] = p.normals.subarray(0, 3);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 1);
  });
});

describe('turnForScroll', () => {
  it('starts in the coin view, turns towards the old face, and clamps', () => {
    expect(turnForScroll(0)).toBeCloseTo(0);
    expect(turnForScroll(0.5)).toBeCloseTo(0.375);
    expect(turnForScroll(1)).toBeCloseTo(0.75);
    expect(turnForScroll(-3)).toBeCloseTo(0);
    expect(turnForScroll(9)).toBeCloseTo(0.75);
  });
});

describe('nextPixelRatio', () => {
  it('keeps the resolution while frames are fast enough', () => {
    expect(nextPixelRatio(16.7, 1.75)).toBe(1.75);
    expect(nextPixelRatio(22, 1.75)).toBe(1.75);
  });

  it('steps down below 45 fps, first to 1 and then to 0.75, never up', () => {
    expect(nextPixelRatio(30, 1.75)).toBe(1);
    expect(nextPixelRatio(30, 1)).toBe(0.75);
    expect(nextPixelRatio(30, 0.75)).toBe(0.75);
  });
});

describe('damp', () => {
  it('moves towards the target without overshooting', () => {
    const v = damp(0, 1, 8, 1 / 60);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
    expect(damp(0, 1, 8, 10)).toBeCloseTo(1, 6);
  });
});
