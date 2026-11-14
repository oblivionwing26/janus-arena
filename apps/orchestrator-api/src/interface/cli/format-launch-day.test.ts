import { newUlid, parseEvent, type JanusEvent } from '@janus/shared-kernel';
import type { LaunchDayVariant } from '@janus/synthlab-report';
import { describe, expect, it } from 'vitest';

import {
  describeDefenses,
  formatLaunchDay,
  launchDayRunOf,
  type LaunchDayRun,
} from './format-launch-day.js';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const interval = (successes: number, n: number) => ({
  rate: successes / n,
  low: 0.2,
  high: 0.8,
  successes,
  n,
});
const variant = (
  name: string,
  attacks: [number, number],
  success: [number, number],
  blocked: [number, number],
): LaunchDayVariant => ({
  variant: name,
  legitimate: {
    sessions: success[1],
    medianSteps: name === 'a' ? 8 : 11,
    success: interval(...success),
    blocked: interval(...blocked),
  },
  attacks: {
    success: interval(...attacks),
    byTask: [
      { task: 'saturation', verdicts: attacks[1], exploitable: attacks[0], refusedAfter: [] },
    ],
  },
  contaminated: 0,
});

describe('describeDefenses (F4.1c)', () => {
  it('names each defense, in a stable order, and none for a variant without any', () => {
    expect(describeDefenses(undefined)).toBe('none');
    expect(describeDefenses({ SHOPLAB_TRUST_FORWARDED_FOR: '1' })).toBe('none');
    expect(
      describeDefenses({
        SHOPLAB_TRUST_FORWARDED_FOR: '1',
        SHOPLAB_STEP_UP_CHECKOUT: 'new-accounts',
        SHOPLAB_RATE_LIMIT_IP: '20/60',
      }),
    ).toBe('rate limit per client 20/60 + checkout step-up (new-accounts)');
  });
});

describe('launchDayRunOf (F4.1c)', () => {
  const emit = (
    seq: number,
    type: string,
    payload: unknown,
    agentId = 'orchestrator',
  ): JanusEvent =>
    parseEvent({
      id: newUlid(),
      runId: RUN_ID,
      seq,
      ts: new Date(Date.UTC(2026, 10, 14, 10, 0, seq)).toISOString(),
      schemaVersion: 1,
      actor: { agentId, role: agentId === 'orchestrator' ? 'orchestrator' : 'navigator' },
      type,
      payload,
    }) as JanusEvent;
  const shopper = (seq: number, client: string | undefined, variant = 'a') =>
    emit(
      seq,
      'session.started',
      {
        variant,
        kind: 'persona',
        persona: 'carmen-retired',
        seed: seq,
        attempt: 1,
        ...(client === undefined ? {} : { role: 'legitimate', client }),
      },
      `shopper-${String(seq)}`,
    );
  const started = emit(0, 'run.started', {
    budget: { maxTokens: 1000, maxEur: 1 },
    variants: [
      { key: 'a', ref: 'main' },
      { key: 'b', ref: 'main', env: { SHOPLAB_RATE_LIMIT_IP: '20/60' } },
    ],
  });

  it('reads the settings of each variant and whether shoppers shared addresses', () => {
    const distinct = launchDayRunOf(RUN_ID, [
      started,
      shopper(1, '10.20.0.1'),
      shopper(2, '10.20.0.2'),
      shopper(3, '10.20.0.3'),
    ]);
    const pairs = launchDayRunOf(RUN_ID, [
      started,
      shopper(1, '10.20.0.1', 'a'),
      shopper(2, '10.20.0.1', 'b'),
      shopper(3, '10.20.0.2', 'a'),
      shopper(4, '10.20.0.2', 'b'),
    ]);
    const shared = launchDayRunOf(RUN_ID, [
      started,
      shopper(1, '10.30.0.1'),
      shopper(2, '10.30.0.2'),
      shopper(3, '10.30.0.1'),
      shopper(4, '10.30.0.2'),
    ]);
    // A retried session is the same slot with the same address, not a shared one.
    const retried = launchDayRunOf(RUN_ID, [
      started,
      shopper(1, '10.20.0.1', 'a'),
      { ...shopper(1, '10.20.0.1', 'a'), seq: 9 },
    ]);
    const none = launchDayRunOf(RUN_ID, [started, shopper(1, undefined)]);

    expect(distinct.settings).toEqual({ a: {}, b: { SHOPLAB_RATE_LIMIT_IP: '20/60' } });
    expect(distinct.addresses).toBe('distinct');
    // A pair presents one address on both variants: that is still an address per shopper.
    expect(pairs.addresses).toBe('distinct');
    expect(retried.addresses).toBe('distinct');
    expect(shared.addresses).toBe('shared');
    expect(none.addresses).toBe('none');
  });
});

describe('formatLaunchDay (F4.1c)', () => {
  const run: LaunchDayRun = {
    runId: RUN_ID,
    settings: { a: {}, b: { SHOPLAB_RATE_LIMIT_IP: '20/60' } },
    addresses: 'shared',
    variants: [variant('a', [2, 2], [18, 18], [0, 18]), variant('b', [0, 2], [12, 18], [6, 18])],
  };

  it('summarises each run on one line, A → B, and details each variant with intervals', () => {
    const text = formatLaunchDay({ format: 'janus-launch-day-report', version: 1, runs: [run] });

    expect(text).toContain(
      '| rate limit per client 20/60 | shared | 100 % → 0 % | 100 % → 67 % | 0 % → 33 % | 8 → 11 |',
    );
    expect(text).toContain(
      '| B | rate limit per client 20/60 | 18 | 67 % (20 %–80 %, 12/18) | 33 % (20 %–80 %, 6/18) | 11 |',
    );
    expect(text).toContain('| A | none | 18 |');
    expect(text).toContain('- A · saturation: 2/2 exploitable, never refused.');
    expect(text).toContain('not predictions of real revenue');
  });
});
