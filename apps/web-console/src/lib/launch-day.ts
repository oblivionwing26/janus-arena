import { isKnownEvent } from '@janus/shared-kernel';
import type { LaunchDayVariant } from '@janus/synthlab-report';

import type { ConsoleEvent } from './console-event';

/** A rate with its 95 % interval, as the report computes it. */
export type RateInterval = NonNullable<LaunchDayVariant['legitimate']['success']>;

/** The three curves of Launch Day (F4.1), in the order they are read. */
export const CURVES = [
  { key: 'legit', title: 'Éxito de los compradores legítimos (más es mejor)' },
  { key: 'attack', title: 'Éxito de los ataques (menos es mejor)' },
  { key: 'blocked', title: 'Compradores legítimos bloqueados por una defensa (menos es mejor)' },
] as const;

export type CurveKey = (typeof CURVES)[number]['key'];

export interface Bar {
  readonly curve: CurveKey;
  readonly variant: string;
  readonly interval: RateInterval | null;
}

/** One bar per variant and curve, grouped by curve, for the chart. */
export function barsOf(variants: readonly LaunchDayVariant[]): Bar[] {
  return CURVES.flatMap(({ key }) =>
    variants.map((each): Bar => {
      const interval =
        key === 'legit'
          ? each.legitimate.success
          : key === 'attack'
            ? each.attacks.success
            : each.legitimate.blocked;
      return { curve: key, variant: each.variant, interval };
    }),
  );
}

export const percent = (share: number): string => `${String(Math.round(share * 100))} %`;

/** `42 % (23–63 %)`, the way a rate and its interval are written in a table. */
export function rateText(interval: RateInterval | null): string {
  if (interval === null) return '—';
  return `${percent(interval.rate)} (${percent(interval.low)}–${percent(interval.high)}) · ${String(interval.successes)}/${String(interval.n)}`;
}

/** Whether the run has Launch Day data: saboteurs or marked shoppers. */
export function hasLaunchDay(events: readonly ConsoleEvent[]): boolean {
  return events
    .filter(isKnownEvent)
    .some(
      (event) =>
        event.type === 'attack.verdict' ||
        (event.type === 'session.started' && event.payload.role !== undefined),
    );
}
