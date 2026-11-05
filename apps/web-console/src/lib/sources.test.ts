// F0.11 "Done when", automated part: the same run looks identical whether it arrives live over
// SSE or from an exported JSON file.

import { describe, expect, it } from 'vitest';

import { RUN_ID, sampleRun } from '@/test-support/sample-run';

import type { ConsoleEvent } from './console-event';
import { summarizeCost } from './cost';
import { buildRunExport, parseRunExport } from './run-export';
import { LiveSource, RecordedSource, type RunEventSource } from './sources';
import { buildTimeline } from './timeline';

// What the orchestrator sends for a run, split into uneven chunks.
function sseResponse(events: readonly ConsoleEvent[]): Response {
  const text = events
    .map(
      (event) =>
        `id: ${String(event.seq)}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('');
  const encoder = new TextEncoder();
  const chunks = [text.slice(0, 50), text.slice(50, 333), text.slice(333)];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function collect(source: RunEventSource): Promise<ConsoleEvent[]> {
  return new Promise((resolve, reject) => {
    const received: ConsoleEvent[] = [];
    source.start({
      onEvents: (events) => received.push(...events),
      onEnd: () => {
        resolve(received);
      },
      onError: (message) => {
        reject(new Error(message));
      },
    });
  });
}

describe('live and recorded sources', () => {
  it('deliver the same events, so the run view is identical', async () => {
    const events = sampleRun();
    const exported = parseRunExport(JSON.stringify(buildRunExport(RUN_ID, events)));

    const live = await collect(
      new LiveSource('/api/orchestrator/runs/x/events', () => Promise.resolve(sseResponse(events))),
    );
    const recorded = await collect(new RecordedSource(exported.events));

    expect(live).toEqual(recorded);
    expect(buildTimeline(live)).toEqual(buildTimeline(recorded));
    expect(summarizeCost(live)).toEqual(summarizeCost(recorded));
  });

  it('reports an error when the orchestrator is not reachable', async () => {
    const source = new LiveSource('/x', () => Promise.resolve(new Response('', { status: 502 })));

    await expect(collect(source)).rejects.toThrow(/502/);
  });
});
