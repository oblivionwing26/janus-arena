import type { LaunchDayVariant } from '@janus/synthlab-report';
import { describe, expect, it } from 'vitest';

import type { ConsoleEvent } from './console-event';
import { barsOf, hasLaunchDay, percent, rateText } from './launch-day';

const interval = (successes: number, n: number) => ({
  rate: successes / n,
  low: 0.1,
  high: 0.9,
  successes,
  n,
});
const variant = (
  name: string,
  legit: number,
  attack: number,
  blocked: number,
): LaunchDayVariant => ({
  variant: name,
  legitimate: { sessions: 10, success: interval(legit, 10), blocked: interval(blocked, 10) },
  attacks: { success: interval(attack, 2), byTask: [] },
  contaminated: 0,
});

const event = (type: string, payload: unknown) =>
  ({
    id: '01JC0F28CNS0000000000000AA',
    runId: '01JC0F28CNS0000000000000AA',
    seq: 0,
    ts: '2026-11-14T10:00:00.000Z',
    schemaVersion: 1,
    actor: { agentId: 'x', role: 'orchestrator' },
    type,
    payload,
  }) as unknown as ConsoleEvent;

describe('the Launch Day chart data (F4.1)', () => {
  it('has one bar per variant and curve, grouped by curve', () => {
    const bars = barsOf([variant('a', 10, 2, 0), variant('b', 9, 0, 2)]);

    expect(bars.map((bar) => `${bar.curve}:${bar.variant}`)).toEqual([
      'legit:a',
      'legit:b',
      'attack:a',
      'attack:b',
      'blocked:a',
      'blocked:b',
    ]);
    expect(bars.find((bar) => bar.curve === 'blocked' && bar.variant === 'b')?.interval?.rate).toBe(
      0.2,
    );
  });

  it('writes a rate with its interval and counts, and a dash when there is none', () => {
    expect(rateText(interval(3, 4))).toBe('75 % (10 %–90 %) · 3/4');
    expect(rateText(null)).toBe('—');
    expect(percent(0.456)).toBe('46 %');
  });

  it('knows a Launch Day run by its verdicts or its roles, and not an ordinary one', () => {
    const slot = { variant: 'a', kind: 'persona', seed: 1, attempt: 1 };

    expect(hasLaunchDay([event('session.started', slot)])).toBe(false);
    expect(hasLaunchDay([event('session.started', { ...slot, role: 'legitimate' })])).toBe(true);
    expect(
      hasLaunchDay([
        event('attack.verdict', {
          attemptId: '01JC0F28CNS0000000000000AA',
          testType: 'saturation',
          oracle: 'unthrottled-requests',
          exploitable: false,
          evidence: 'x',
        }),
      ]),
    ).toBe(true);
    expect(hasLaunchDay([])).toBe(false);
  });
});
