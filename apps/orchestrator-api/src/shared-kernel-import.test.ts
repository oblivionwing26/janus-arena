// The orchestrator is the first app to consume @janus/shared-kernel (see the F0.3 note in
// docs/ROADMAP.md). This proves the package and its types resolve from an app.

import { isKnownEvent, parseEvent, type JanusEvent, type UnknownEvent } from '@janus/shared-kernel';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('@janus/shared-kernel from orchestrator-api', () => {
  it('parses an event with the package API and types', () => {
    const event = parseEvent({
      id: '01JBZ7Q8K5V4W3X2Y1Z0ABCDEG',
      runId: '01JBZ7Q8K5V4W3X2Y1Z0ABCDEF',
      seq: 0,
      ts: '2026-11-05T10:00:00.000Z',
      schemaVersion: 1,
      actor: { agentId: 'orchestrator', role: 'orchestrator' },
      type: 'run.completed',
      payload: { outcome: 'success' },
    });

    expectTypeOf(event).toEqualTypeOf<JanusEvent | UnknownEvent>();
    expect(isKnownEvent(event) && event.type === 'run.completed' && event.payload.outcome).toBe(
      'success',
    );
  });
});
