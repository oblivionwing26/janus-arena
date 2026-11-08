import { parseEvent } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';
import { SseParser } from './sse';

/**
 * Every recorded event of a run, read once from the orchestrator's replay stream
 * (`GET /runs/:id/events?replay=1`). Events that do not parse are skipped, as in the timeline.
 */
export async function fetchRunEvents(
  runId: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<ConsoleEvent[]> {
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
