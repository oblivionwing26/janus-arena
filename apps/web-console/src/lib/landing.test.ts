import { describe, expect, it } from 'vitest';

import { storyKind, timeAgo } from './landing';

const link = (href: string) => ({ label: 'x', href });

describe('storyKind (F4.7a)', () => {
  it('reads the kind of a story from the pages it links to', () => {
    expect(storyKind({ links: [link('/runs/1/attack'), link('/runs/1')] })).toBe('gate');
    expect(storyKind({ links: [link('/runs/1/launch-day'), link('/runs/1')] })).toBe('launch-day');
    expect(storyKind({ links: [link('/runs/1/report'), link('/runs/1')] })).toBe('ab');
    expect(storyKind({ links: [] })).toBe('ab');
  });
});

describe('timeAgo (F4.7a)', () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);

  it('says how long ago, in the largest whole unit', () => {
    expect(timeAgo('2026-11-19T11:59:40.000Z', now)).toBe('just now');
    expect(timeAgo('2026-11-19T11:45:00.000Z', now)).toBe('15 minutes ago');
    expect(timeAgo('2026-11-18T12:00:00.000Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-14T12:00:00.000Z', now)).toBe('5 days ago');
  });
});
