import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { newUlid } from './new-ulid.js';

describe('newUlid', () => {
  it('produces a valid ULID', () => {
    expect(z.ulid().safeParse(newUlid()).success).toBe(true);
  });

  it('encodes the timestamp in the first 10 characters, so ids sort by time', () => {
    const earlier = newUlid(Date.UTC(2026, 0, 1));
    const later = newUlid(Date.UTC(2026, 0, 2));

    expect(earlier.slice(0, 10) < later.slice(0, 10)).toBe(true);
    expect(newUlid(0).slice(0, 10)).toBe('0000000000');
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newUlid()));

    expect(ids.size).toBe(10_000);
  });
});
