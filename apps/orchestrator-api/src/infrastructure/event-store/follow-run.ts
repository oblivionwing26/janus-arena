import type { StoredEvent } from '../../domain/event-store/stored-event.js';

export interface FollowRunSource {
  readRun(runId: string, fromSeq: number): Promise<StoredEvent[]>;
  /** Calls onChange whenever events may have been appended to the run. Returns an unsubscribe. */
  watch(runId: string, onChange: () => void): Promise<() => void> | (() => void);
}

/**
 * Catch-up-then-live subscription shared by every EventStorePort adapter.
 * It starts watching before the first read and re-reads after every change,
 * so events appended in between are never missed or delivered twice.
 */
export async function* followRun(
  source: FollowRunSource,
  runId: string,
  fromSeq: number,
  signal?: AbortSignal,
): AsyncGenerator<StoredEvent> {
  let changes = 0;
  let wake: (() => void) | undefined;
  const onChange = () => {
    changes++;
    wake?.();
  };
  const onAbort = () => wake?.();
  const aborted = () => signal?.aborted === true;

  const unwatch = await source.watch(runId, onChange);
  signal?.addEventListener('abort', onAbort);
  try {
    let nextSeq = fromSeq;
    while (!aborted()) {
      const seen = changes;
      const events = await source.readRun(runId, nextSeq);
      for (const event of events) {
        if (aborted()) return;
        yield event;
        nextSeq = event.seq + 1;
      }
      if (events.length === 0 && changes === seen && !aborted()) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    unwatch();
  }
}
