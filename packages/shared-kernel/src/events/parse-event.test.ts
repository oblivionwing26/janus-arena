import { describe, expect, expectTypeOf, it } from 'vitest';

import { envelope, validEvents } from '../test-support/event-fixtures.js';
import { InvalidEventError } from './invalid-event-error.js';
import type { JanusEvent } from './janus-event.js';
import { parseEvent } from './parse-event.js';
import { isKnownEvent, type UnknownEvent } from './unknown-event.js';

describe('parseEvent', () => {
  it('returns a discriminated JanusEvent for a known type', () => {
    const event = parseEvent(validEvents['llm.call']);

    expect(isKnownEvent(event)).toBe(true);
    if (!isKnownEvent(event)) return;
    expectTypeOf(event).toEqualTypeOf<JanusEvent>();

    switch (event.type) {
      case 'llm.call':
        expectTypeOf(event.payload.role).toEqualTypeOf<
          | 'navigator'
          | 'competent-baseline'
          | 'ui-engineer'
          | 'red-team'
          | 'blue-team'
          | 'architect'
        >();
        expectTypeOf(event.cost.cacheReadInputTokens).toEqualTypeOf<number>();
        expect(event.payload.model).toBe('claude-haiku-5-5');
        expect(event.cost.cacheReadInputTokens).toBe(900);
        break;
      default:
        throw new Error(`unexpected type ${event.type}`);
    }
  });

  it('preserves an unknown type as UnknownEvent without failing', () => {
    const raw = envelope(
      'replay.bookmarked',
      { at: 42, note: 'from the future' },
      { extra: { kept: true } },
    );

    const event = parseEvent(raw);

    expect(isKnownEvent(event)).toBe(false);
    expect(event).toEqual(raw);
    if (!isKnownEvent(event)) expectTypeOf(event).toEqualTypeOf<UnknownEvent>();
  });

  it('treats a known type with a newer schemaVersion as UnknownEvent', () => {
    const raw = { ...validEvents['run.started'], schemaVersion: 2, payload: { shape: 'changed' } };

    const event = parseEvent(raw);

    expect(isKnownEvent(event)).toBe(false);
    expect(event).toEqual(raw);
  });

  it('throws InvalidEventError when the envelope is invalid, even for an unknown type', () => {
    const raw = envelope('replay.bookmarked', {}, { id: 'nope' });

    expect(() => parseEvent(raw)).toThrow(InvalidEventError);
  });

  it('throws InvalidEventError for a non-object input', () => {
    expect(() => parseEvent('run.started')).toThrow(InvalidEventError);
    expect(() => parseEvent(null)).toThrow(InvalidEventError);
  });

  it('throws InvalidEventError when a known type has an invalid payload', () => {
    const raw = { ...validEvents['run.completed'], payload: { outcome: 'maybe' } };

    try {
      parseEvent(raw);
      expect.unreachable('parseEvent should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEventError);
      expect((error as InvalidEventError).issues.length).toBeGreaterThan(0);
    }
  });
});
