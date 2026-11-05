import type { RunCompletedEvent } from '@janus/shared-kernel';

import type { StoredEvent } from './stored-event.js';

export type RunOutcome = RunCompletedEvent['payload']['outcome'];

/** A run as listed by the API. Its status is derived from its events, never stored apart. */
export interface RunSummary {
  readonly runId: string;
  readonly startedAt: string;
  readonly eventCount: number;
  readonly status: 'running' | 'completed';
  readonly outcome: RunOutcome | null;
  readonly reason: string | null;
}

export function isRunCompleted(event: StoredEvent): event is RunCompletedEvent {
  return event.type === 'run.completed' && event.schemaVersion === 1;
}

/** Summary of a run from its events in seq order. Returns null for a run with no events. */
export function summarizeRun(events: readonly StoredEvent[]): RunSummary | null {
  const first = events[0];
  if (first === undefined) return null;
  const completed = events.find(isRunCompleted);
  return {
    runId: first.runId,
    startedAt: first.ts,
    eventCount: events.length,
    status: completed === undefined ? 'running' : 'completed',
    outcome: completed?.payload.outcome ?? null,
    reason: completed?.payload.reason ?? null,
  };
}
