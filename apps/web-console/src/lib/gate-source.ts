import { isKnownEvent } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';
import { fetchRunEvents } from './run-events';
import type { RunEventSource, SourceHandlers } from './sources';

/** The runs a gate's stages started, from its `gate.stage` run events. */
function childRuns(gate: readonly ConsoleEvent[]): string[] {
  return [
    ...new Set(
      gate.flatMap((event) =>
        isKnownEvent(event) &&
        event.type === 'gate.stage' &&
        event.payload.status === 'run' &&
        event.payload.runId !== undefined
          ? [event.payload.runId]
          : [],
      ),
    ),
  ];
}

/**
 * A gate as one stream (F3.10): its own events and those of every run its stages started, merged
 * by time. A gate spans many runs whose seq numbers collide, so each event is renumbered in the
 * order it is emitted; one that was already emitted is never sent again. While the gate has no
 * `run.completed` the source polls for what is new, so the live view and the replay of a finished
 * gate are the same stream. A run that is not a gate is just its own events.
 */
export class GateEventSource implements RunEventSource {
  private readonly fetchImpl: typeof fetch;
  private readonly pollMs: number;

  constructor(
    private readonly gateRunId: string,
    options: { readonly fetchImpl?: typeof fetch; readonly pollMs?: number } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.pollMs = options.pollMs ?? 3000;
  }

  start(handlers: SourceHandlers): () => void {
    let stopped = false;
    const seen = new Set<string>();
    let seq = 0;

    const run = async () => {
      while (!stopped) {
        const gate = await fetchRunEvents(this.gateRunId, this.fetchImpl);
        const children = await Promise.all(
          childRuns(gate).map((runId) =>
            fetchRunEvents(runId, this.fetchImpl).catch((): ConsoleEvent[] => []),
          ),
        );
        const fresh = [...gate, ...children.flat()]
          .filter((event) => !seen.has(event.id))
          .sort(
            (a, b) =>
              Date.parse(a.ts) - Date.parse(b.ts) ||
              a.runId.localeCompare(b.runId) ||
              a.seq - b.seq,
          );
        for (const event of fresh) seen.add(event.id);
        if (stopped) return;
        if (fresh.length > 0) {
          handlers.onEvents(fresh.map((event) => ({ ...event, seq: seq++ }) as ConsoleEvent));
        }
        if (gate.some((event) => event.type === 'run.completed')) {
          handlers.onEnd?.();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
    };

    void run().catch((error: unknown) => {
      if (!stopped) handlers.onError?.(error instanceof Error ? error.message : String(error));
    });
    return () => {
      stopped = true;
    };
  }
}
