import { buildRunExport, parseEvent, type JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { loadReplayRun, ReplayInputError, type ReplayInputDeps } from './replay-input.js';

const RUN_ID = '01JC0F12RVN00000000000000A';

function started(runId: string): JanusEvent {
  return parseEvent({
    id: '01JC0F12RVN00000000000000B',
    runId,
    seq: 0,
    ts: '2026-11-06T00:00:00.000Z',
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type: 'run.started',
    payload: { budget: { maxTokens: 1000, maxEur: 1 } },
  }) as JanusEvent;
}

function deps(files: Record<string, string>, runs: Record<string, StoredEvent[]>) {
  const readRun: string[] = [];
  const value: ReplayInputDeps = {
    readTextFile: (path) => Promise.resolve(files[path] ?? null),
    readRun: (runId) => {
      readRun.push(runId);
      return Promise.resolve(runs[runId] ?? []);
    },
  };
  return { value, readRun };
}

describe('loadReplayRun', () => {
  it('reads an exported janus-run file without touching the database', async () => {
    const file = JSON.stringify(buildRunExport(RUN_ID, [started(RUN_ID)]));
    const { value, readRun } = deps({ '/runs/a.json': file }, {});

    const run = await loadReplayRun('/runs/a.json', value);

    expect(run).toEqual({ runId: RUN_ID, source: 'file', events: [started(RUN_ID)] });
    expect(readRun).toEqual([]);
  });

  it('reads a run id from the event store', async () => {
    const { value } = deps({}, { [RUN_ID]: [started(RUN_ID)] });

    const run = await loadReplayRun(RUN_ID, value);

    expect(run).toEqual({ runId: RUN_ID, source: 'database', events: [started(RUN_ID)] });
  });

  it('rejects a run id with no events', async () => {
    const { value } = deps({}, {});

    await expect(loadReplayRun(RUN_ID, value)).rejects.toThrow(ReplayInputError);
  });

  it('rejects an argument that is neither a file nor a run id', async () => {
    const { value } = deps({}, {});

    await expect(loadReplayRun('missing.json', value)).rejects.toThrow(/neither a file/);
  });

  it('reports an invalid export file as a ReplayInputError', async () => {
    const { value } = deps({ 'bad.json': '{"format":"other"}' }, {});

    await expect(loadReplayRun('bad.json', value)).rejects.toThrow(ReplayInputError);
  });
});
