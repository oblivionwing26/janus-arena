import { describe, expect, it } from 'vitest';

import { RUN_ID, sampleRun } from '@/test-support/sample-run';

import { buildRunExport, parseRunExport, RunExportError } from './run-export';

describe('run export', () => {
  it('round-trips a run exactly, unknown events included', () => {
    const events = sampleRun();
    const text = JSON.stringify(buildRunExport(RUN_ID, events, new Date('2026-11-05T16:00:00Z')));

    const parsed = parseRunExport(text);

    expect(parsed.runId).toBe(RUN_ID);
    expect(parsed.events).toEqual(events);
  });

  it('writes the janus-run format header', () => {
    expect(buildRunExport(RUN_ID, [], new Date('2026-11-05T16:00:00Z'))).toEqual({
      format: 'janus-run',
      version: 1,
      runId: RUN_ID,
      exportedAt: '2026-11-05T16:00:00.000Z',
      events: [],
    });
  });

  it.each([
    ['not JSON', '{oops'],
    ['another format', JSON.stringify({ format: 'other', version: 1, runId: RUN_ID, events: [] })],
    [
      'an event from another run',
      JSON.stringify(
        buildRunExport('01JC0F11OTHERRUN000000000Z'.replace('O', '0'), sampleRun(), new Date()),
      ),
    ],
    [
      'an invalid event envelope',
      JSON.stringify({ ...buildRunExport(RUN_ID, [], new Date()), events: [{ seq: -1 }] }),
    ],
  ])('rejects %s with a clear error', (_label, text) => {
    expect(() => parseRunExport(text)).toThrow(RunExportError);
  });
});
