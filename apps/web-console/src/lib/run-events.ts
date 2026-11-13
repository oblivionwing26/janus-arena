import { parseEvent, parseRunExport } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';
import { DEMO } from './demo';
import { SseParser } from './sse';

/**
 * Every recorded event of a run: read once from the orchestrator's replay stream
 * (`GET /runs/:id/events?replay=1`), skipping events that do not parse as the timeline does; or,
 * in the demo (F3.12), from the exported run under `/demo/runs`, validated as any exported run is.
 */
export async function fetchRunEvents(
  runId: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  options: { readonly demo?: boolean } = {},
): Promise<ConsoleEvent[]> {
  if (options.demo ?? DEMO) {
    const response = await fetchImpl(`/demo/runs/${runId}.json`);
    if (!response.ok) throw new Error(`Este run no está en la demo (${String(response.status)})`);
    return parseRunExport(await response.text()).events;
  }
  const response = await fetchImpl(`/api/orchestrator/runs/${runId}/events?replay=1`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!response.ok) throw new Error(`El orquestador respondió ${String(response.status)}`);
  const events: ConsoleEvent[] = [];
  for (const message of new SseParser().push(`${await response.text()}\n\n`)) {
    try {
      events.push(parseEvent(JSON.parse(message.data)));
    } catch {
      // A malformed event is left out; the timeline shows the same run.
    }
  }
  return events;
}
