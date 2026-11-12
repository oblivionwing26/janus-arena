// The engine on a real session: Carmen's purchase recorded in F1.4 (15 steps, three waits while
// forms submitted, no baseline in that run). A clean purchase must not produce spurious signals.
// The navigator's replay fixture was re-recorded when its tools changed (F3.5a); these events are
// that original session, kept for the engine because its waits are what this test is about.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { detectFriction } from './detect-friction.js';

const events = (
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../recordings/fixtures/friction/carmen-f14-events.json', import.meta.url),
      ),
      'utf8',
    ),
  ) as unknown[]
).map(parseEvent);

describe('the recorded F1.4 session', () => {
  it('is a real purchase with waits in it', () => {
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === 'agent.action')).toHaveLength(15);
    expect(
      events.filter(
        (event) =>
          event.type === 'agent.action' && (event.payload as { action: string }).action === 'wait',
      ),
    ).toHaveLength(3);
  });

  it('produces no friction signals: it was a clean purchase and the waits are not friction', () => {
    expect(detectFriction(events)).toEqual([]);
  });

  it('still detects abandonment if the same session had ended in giving up', () => {
    const abandoned = events.map((event) =>
      event.type === 'session.ended'
        ? parseEvent({ ...event, payload: { ...(event.payload as object), outcome: 'abandon' } })
        : event,
    );

    expect(detectFriction(abandoned).map((signal) => signal.detector)).toEqual(['abandonment']);
  });
});
