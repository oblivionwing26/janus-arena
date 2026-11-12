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
  'agent.thought': [
    'a thought over 200 characters',
    withPayload('agent.thought', { text: 'x'.repeat(201) }),
  ],
  'page.error': ['an unknown kind', withPayload('page.error', { kind: 'network' })],
  'page.screenshot': [
    'a path outside the run',
    withPayload('page.screenshot', { artifact: '../etc/x.png' }),
  ],
  'task.verified': ['an unknown status', withPayload('task.verified', { status: 'maybe' })],
  'session.started': [
    'a variant name too long',
    withPayload('session.started', { variant: 'variant-b' }),
  ],
  'page.vitals': ['a negative CLS', withPayload('page.vitals', { cls: -0.1 })],
  'session.ended': ['an unknown outcome', withPayload('session.ended', { outcome: 'crashed' })],
  'attack.attempt': ['a status that is not HTTP', withPayload('attack.attempt', { status: 42 })],
  'attack.verdict': [
    'an oracle that does not exist',
    withPayload('attack.verdict', { oracle: 'llm-opinion' }),
  ],
  'finding.confirmed': [
    'a confirmation without its PoC',
    withPayload('finding.confirmed', { pocRef: '' }),
  ],
  'finding.remediated': [
    'a fix without its patch',
    withPayload('finding.remediated', { patchId: undefined }),
  ],
  'scope.verified': [
    'an unknown test type',
    withPayload('scope.verified', { allowedTests: ['ddos'] }),
  ],
  'scope.blocked': [
    'a reason the guard never gives',
    withPayload('scope.blocked', { reason: 'felt-like-it' }),
  ],
  'surface.mapped': [
    'an owner check that is neither boolean nor unknown',
    withPayload('surface.mapped', {
      endpoints: [
        {
          method: 'GET',
          route: '/x',
          auth: true,
          ownerCheck: 'maybe',
          params: [],
          file: 'a.ts',
          line: 1,
        },
      ],
    }),
  ],
  'audit.completed': [
    'a sha that is not a full git sha',
    withPayload('audit.completed', { variant: { ref: 'main', sha: 'abc' } }),
  ],
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
        'agent.thought',
        'session.ended',
        'page.error',
        'page.vitals',
        'page.screenshot',
        'session.started',
        'task.verified',
        'audit.completed',
        'surface.mapped',
        'scope.verified',
        'scope.blocked',
        'attack.attempt',
        'attack.verdict',
        'finding.confirmed',
        'finding.remediated',
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

  it('agent.action carries an optional errorCode for failed actions (F1.2)', () => {
    const failed = { ok: false, errorCode: 'browser.element-obscured' };
    expect(janusEventSchema.safeParse(withPayload('agent.action', failed)).success).toBe(true);
    expect(
      janusEventSchema.safeParse(withPayload('agent.action', { ok: false, errorCode: 'Oops!' }))
        .success,
    ).toBe(false);
  });

  it('run.completed may count its sessions (F1.7)', () => {
    const sessions = {
      total: 10,
      completed: 8,
      failed: 1,
      budgetExhausted: 0,
      cancelled: 0,
      excluded: 1,
    };
    expect(janusEventSchema.safeParse(withPayload('run.completed', { sessions })).success).toBe(
      true,
    );
    expect(
      janusEventSchema.safeParse(
        withPayload('run.completed', { sessions: { ...sessions, excluded: -1 } }),
      ).success,
    ).toBe(false);
  });

  it('patch.proposed accepts janus/variant-<ULID> branches', () => {
    const branch = `janus/variant-${OTHER_ID}`;
    expect(janusEventSchema.safeParse(withPayload('patch.proposed', { branch })).success).toBe(
      true,
    );
  });
});
