import type { FeaturedRun } from './backend';

/** What a featured story shows, read from the pages it links to (the demo index has no kind). */
export type StoryKind = 'gate' | 'launch-day' | 'ab';

export function storyKind(story: Pick<FeaturedRun, 'links'>): StoryKind {
  if (story.links.some((link) => link.href.endsWith('/attack'))) return 'gate';
  if (story.links.some((link) => link.href.endsWith('/launch-day'))) return 'launch-day';
  return 'ab';
}

export const STORY_LABEL: Readonly<Record<StoryKind, string>> = {
  gate: 'Full gate',
  'launch-day': 'Launch Day',
  ab: 'A/B · SynthLab',
};

/** Which face of Janus a story is mostly about: the colour of its card. */
export const STORY_FACE: Readonly<Record<StoryKind, 'ux' | 'sec' | 'both'>> = {
  gate: 'both',
  'launch-day': 'sec',
  ab: 'ux',
};

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 days ago", from an ISO date and the current time. */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
