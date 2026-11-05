import { describe, expect, it } from 'vitest';

import { parseEvent } from '../events/parse-event.js';
import { envelope, OTHER_ID, RUN_ID, validEvents } from '../test-support/event-fixtures.js';
import { buildRunExport, parseRunExport } from './run-export.js';
import { InvalidRunExportError } from './invalid-run-export-error.js';

const NOW = new Date('2026-11-05T16:00:00Z');

function sampleEvents() {
  return [
    parseEvent(validEvents['run.started']),
    parseEvent({ ...validEvents['agent.step'], seq: 1 }),
    parseEvent(envelope('replay.bookmarked', { note: 'from the future' }, { seq: 2 })),
  ];
}

describe('run export (janus-run v1)', () => {
  it('writes the format header', () => {
    expect(buildRunExport(RUN_ID, [], NOW)).toEqual({
      format: 'janus-run',
      version: 1,
      runId: RUN_ID,
      exportedAt: '2026-11-05T16:00:00.000Z',
      events: [],
    });
  });

  it('round-trips a run exactly, unknown event types included', () => {
    const events = sampleEvents();

    const parsed = parseRunExport(JSON.stringify(buildRunExport(RUN_ID, events, NOW)));

    expect(parsed).toEqual({ runId: RUN_ID, events });
  });

  it.each([
    ['not JSON', '{oops'],
    ['another format', JSON.stringify({ format: 'other', version: 1, runId: RUN_ID, events: [] })],
    ['a newer version', JSON.stringify({ ...buildRunExport(RUN_ID, [], NOW), version: 2 })],
    [
      'an event from another run',
      JSON.stringify(
        buildRunExport(
          RUN_ID,
          [parseEvent({ ...validEvents['run.started'], runId: OTHER_ID })],
          NOW,
        ),
      ),
    ],
    [
      'an invalid event envelope',
      JSON.stringify({ ...buildRunExport(RUN_ID, [], NOW), events: [{ seq: -1 }] }),
    ],
  ])('rejects %s with InvalidRunExportError', (_label, text) => {
    expect(() => parseRunExport(text)).toThrow(InvalidRunExportError);
  });
});
