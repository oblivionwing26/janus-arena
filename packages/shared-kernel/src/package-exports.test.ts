// Imports the package by its public name, so it resolves through package.json "exports"
// to the built dist/ output, the same way the apps will (F0.4, F0.11).

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  InvalidEventError,
  isKnownEvent,
  parseEvent,
  type EventEnvelope,
  type JanusEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';

import { validEvents } from './test-support/event-fixtures.js';

describe('@janus/shared-kernel public API', () => {
  it('parses events through the built package', () => {
    const event = parseEvent(validEvents['run.started']);

    expectTypeOf(event).toEqualTypeOf<JanusEvent | UnknownEvent>();
    expect(isKnownEvent(event)).toBe(true);
    if (isKnownEvent(event) && event.type === 'run.started') {
      expect(event.payload.budget.maxEur).toBe(2);
    }
  });

  it('exposes the envelope type and the typed error', () => {
    expectTypeOf<JanusEvent>().toExtend<EventEnvelope>();
    expect(() => parseEvent({})).toThrow(InvalidEventError);
  });
});
