import type { StoredEvent } from '../../domain/event-store/stored-event.js';

// First (runId, seq) pair that repeats inside one batch, if any.
export function findDuplicateSeq(
  events: readonly StoredEvent[],
): { runId: string; seq: number } | undefined {
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.runId}:${String(event.seq)}`;
    if (seen.has(key)) return { runId: event.runId, seq: event.seq };
    seen.add(key);
  }
  return undefined;
}
