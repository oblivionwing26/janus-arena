import { describe, expect, it } from 'vitest';

import { OTHER_ID, validEvents } from '../../test-support/event-fixtures.js';
import { janusEventSchema, type JanusEventType } from '../janus-event.js';

function withPayload(
  type: JanusEventType,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const event = validEvents[type];
  return { ...event, payload: { ...(event.payload as Record<string, unknown>), ...patch } };
}

const invalidEvents: Record<JanusEventType, [string, Record<string, unknown>]> = {
  'run.started': [
    'a zero token budget',
    withPayload('run.started', { budget: { maxTokens: 0, maxEur: 2 } }),
  ],
  'run.completed': ['an unknown outcome', withPayload('run.completed', { outcome: 'maybe' })],
  'agent.step': ['a relative url', withPayload('agent.step', { url: '/checkout' })],
  'agent.action': ['a negative duration', withPayload('agent.action', { durationMs: -5 })],
  'friction.signal': [
    'no evidence events',
    withPayload('friction.signal', { evidenceEventIds: [] }),
  ],
  'llm.call': [
    'a role that is not a model role',
    withPayload('llm.call', { role: 'orchestrator' }),
  ],
  'finding.created': [
    'an unknown severity',
    withPayload('finding.created', { severity: 'urgent' }),
  ],
  'patch.proposed': ['a branch outside janus/*', withPayload('patch.proposed', { branch: 'main' })],
  'budget.threshold': ['an unknown level', withPayload('budget.threshold', { level: 'panic' })],
  'verification.result': [
    'a missing passed flag',
    withPayload('verification.result', { passed: undefined }),
  ],
};

describe('v1 event schemas', () => {
  const types = Object.keys(validEvents) as JanusEventType[];

  it('covers the ten v1 event types', () => {
    expect(types.sort()).toEqual(
      [
        'agent.action',
        'agent.step',
        'finding.created',
        'friction.signal',
        'llm.call',
        'patch.proposed',
        'run.completed',
        'run.started',
        'verification.result',
        'budget.threshold',
      ].sort(),
    );
  });

  it.each(types)('%s accepts a valid example', (type) => {
    const result = janusEventSchema.safeParse(validEvents[type]);
    expect(result.error).toBeUndefined();
  });

  it.each(types)('%s rejects an invalid example', (type) => {
    const [, invalid] = invalidEvents[type];
    expect(janusEventSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a known type with schemaVersion other than 1', () => {
    expect(
      janusEventSchema.safeParse({ ...validEvents['run.started'], schemaVersion: 2 }).success,
    ).toBe(false);
  });

  it('llm.call requires cost', () => {
    const { cost: _cost, ...withoutCost } = validEvents['llm.call'];
    expect(janusEventSchema.safeParse(withoutCost).success).toBe(false);
  });

  it('llm.call accepts a missing requestHash but rejects an empty one', () => {
    const { requestHash: _hash, ...payload } = validEvents['llm.call'].payload as Record<
      string,
      unknown
    >;
    expect(janusEventSchema.safeParse({ ...validEvents['llm.call'], payload }).success).toBe(true);
    expect(janusEventSchema.safeParse(withPayload('llm.call', { requestHash: '' })).success).toBe(
      false,
    );
  });

  it('finding.created cannot be confirmed without a pocRef', () => {
    expect(
      janusEventSchema.safeParse(withPayload('finding.created', { pocRef: undefined })).success,
    ).toBe(false);
    expect(
      janusEventSchema.safeParse(
        withPayload('finding.created', { status: 'suspected', pocRef: undefined }),
      ).success,
    ).toBe(true);
  });

  it('patch.proposed accepts janus/variant-<ULID> branches', () => {
    const branch = `janus/variant-${OTHER_ID}`;
    expect(janusEventSchema.safeParse(withPayload('patch.proposed', { branch })).success).toBe(
      true,
    );
  });
});
