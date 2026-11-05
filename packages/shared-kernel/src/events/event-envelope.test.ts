import { describe, expect, it } from 'vitest';

import { envelope, sampleCost } from '../test-support/event-fixtures.js';
import { eventEnvelopeSchema } from './event-envelope.js';

const valid = envelope('anything.happened', { any: 'payload' });

describe('eventEnvelopeSchema', () => {
  it('accepts a valid envelope with and without cost', () => {
    expect(eventEnvelopeSchema.safeParse(valid).success).toBe(true);
    expect(eventEnvelopeSchema.safeParse({ ...valid, cost: sampleCost }).success).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a malformed ULID id', { id: 'not-a-ulid' }],
    ['a malformed ULID runId', { runId: '123' }],
    ['a negative seq', { seq: -1 }],
    ['a fractional seq', { seq: 1.5 }],
    ['a non-ISO ts', { ts: '05/11/2026 10:00' }],
    ['a ts with a non-UTC offset', { ts: '2026-11-05T10:00:00+01:00' }],
    ['schemaVersion 0', { schemaVersion: 0 }],
    ['a missing actor', { actor: undefined }],
    ['an unknown actor role', { actor: { agentId: 'orchestrator', role: 'intern' } }],
    ['an agentId that is not a slug', { actor: { agentId: 'Persona Ana', role: 'navigator' } }],
    ['an agentId starting with a dash', { actor: { agentId: '-ana', role: 'navigator' } }],
    ['an agentId longer than 64 chars', { actor: { agentId: 'a'.repeat(65), role: 'navigator' } }],
    ['an empty type', { type: '' }],
    ['negative cost tokens', { cost: { ...sampleCost, inputTokens: -1 } }],
    ['fractional cache tokens', { cost: { ...sampleCost, cacheReadInputTokens: 1.5 } }],
    ['negative estimatedEur', { cost: { ...sampleCost, estimatedEur: -0.01 } }],
    [
      'cost without cache creation tokens',
      { cost: { ...sampleCost, cacheCreationInputTokens: undefined } },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(eventEnvelopeSchema.safeParse({ ...valid, ...overrides }).success).toBe(false);
  });

  it('accepts an agentId of exactly 64 chars', () => {
    const actor = { agentId: 'a'.repeat(64), role: 'navigator' };
    expect(eventEnvelopeSchema.safeParse({ ...valid, actor }).success).toBe(true);
  });
});
