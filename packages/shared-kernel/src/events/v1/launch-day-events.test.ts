import { describe, expect, it } from 'vitest';

import { validEvents } from '../../test-support/event-fixtures.js';
import { janusEventSchema } from '../janus-event.js';

function with_(type: 'session.started' | 'run.started', patch: Record<string, unknown>) {
  const event = validEvents[type];
  return { ...event, payload: { ...(event.payload as Record<string, unknown>), ...patch } };
}

describe('Launch Day fields on existing events (F4.1)', () => {
  it('session.started may say who plays and from which address, and stays valid without it', () => {
    expect(janusEventSchema.safeParse(validEvents['session.started']).success).toBe(true);
    expect(
      janusEventSchema.safeParse(
        with_('session.started', { role: 'saboteur', client: '10.20.0.7' }),
      ).success,
    ).toBe(true);
    expect(janusEventSchema.safeParse(with_('session.started', { role: 'tester' })).success).toBe(
      false,
    );
    expect(
      janusEventSchema.safeParse(with_('session.started', { client: '10.0.0.1, evil' })).success,
    ).toBe(false);
  });

  it('run.started may name the settings a variant ran with, in upper case', () => {
    const variants = (env: Record<string, string>) => [{ key: 'b', ref: 'main', env }];

    expect(
      janusEventSchema.safeParse(
        with_('run.started', { variants: variants({ SHOPLAB_RATE_LIMIT_IP: '20/30' }) }),
      ).success,
    ).toBe(true);
    expect(
      janusEventSchema.safeParse(
        with_('run.started', { variants: variants({ 'shoplab-rate': '20/30' }) }),
      ).success,
    ).toBe(false);
  });
});
