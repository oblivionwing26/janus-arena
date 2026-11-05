import { InvalidEventError, parseEvent } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';
import { SseParser } from './sse';

export interface SourceHandlers {
  onEvents(events: ConsoleEvent[]): void;
  /** The source has nothing more to send (stream closed, or recording delivered). */
  onEnd?(): void;
  onError?(message: string): void;
}

/** Where a run view gets its events from. Returns a function that stops the source. */
export interface RunEventSource {
  start(handlers: SourceHandlers): () => void;
}

/** A recorded run: an exported JSON file or the orchestrator's ?replay=1 output. */
export class RecordedSource implements RunEventSource {
  constructor(private readonly events: readonly ConsoleEvent[]) {}

  start(handlers: SourceHandlers): () => void {
    let stopped = false;
    queueMicrotask(() => {
      if (stopped) return;
      handlers.onEvents([...this.events]);
      handlers.onEnd?.();
    });
    return () => {
      stopped = true;
    };
  }
}

/** The orchestrator's live SSE stream (GET /runs/:id/events), read with fetch. */
export class LiveSource implements RunEventSource {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  start(handlers: SourceHandlers): () => void {
    const controller = new AbortController();
    void this.read(handlers, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        handlers.onError?.(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      controller.abort();
    };
  }

  private async read(handlers: SourceHandlers, signal: AbortSignal): Promise<void> {
    const response = await this.fetchImpl(this.url, {
      signal,
      headers: { accept: 'text/event-stream' },
    });
    if (!response.ok || response.body === null) {
      throw new Error(`El orquestador respondió ${String(response.status)}`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const parser = new SseParser();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const events: ConsoleEvent[] = [];
      for (const message of parser.push(value)) {
        try {
          events.push(parseEvent(JSON.parse(message.data)));
        } catch (error) {
          const detail = error instanceof InvalidEventError ? error.message : String(error);
          handlers.onError?.(`Evento descartado: ${detail}`);
        }
      }
      if (events.length > 0) handlers.onEvents(events);
    }
    handlers.onEnd?.();
  }
}
