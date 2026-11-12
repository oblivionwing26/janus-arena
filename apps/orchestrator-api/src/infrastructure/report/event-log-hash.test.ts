import { describe, expect, it } from 'vitest';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { canonicalJson, eventLogHash } from './event-log-hash.js';

const event = (seq: number, payload: Record<string, unknown>) =>
  ({
    id: `01JC0F2HB7E00000000000${String(seq).padStart(4, '0')}`,
    runId: '01JC0F2HB7E0000000000000AA',
    seq,
    ts: '2026-11-12T10:00:00.000Z',
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type: 'agent.step',
    payload,
  }) as unknown as StoredEvent;

describe('eventLogHash (F3.7)', () => {
  it('writes JSON with sorted keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"x":0,"y":1}]},"b":1}',
    );
  });

  it('does not depend on the order events or keys were read in', () => {
    const one = event(0, { stepIndex: 0, url: 'http://x/' });
    const two = event(1, { url: 'http://x/a', stepIndex: 1 });

    expect(eventLogHash([two, one])).toBe(eventLogHash([one, two]));
    expect(eventLogHash([one])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any event changes', () => {
    const before = eventLogHash([event(0, { stepIndex: 0, url: 'http://x/' })]);

    expect(eventLogHash([event(0, { stepIndex: 0, url: 'http://x/b' })])).not.toBe(before);
  });
});
