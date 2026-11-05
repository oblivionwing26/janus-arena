import { DuplicateEventSeqError } from '../../domain/event-store/duplicate-event-seq-error.js';
import type {
  EventStorePort,
  SubscribeOptions,
} from '../../domain/event-store/event-store-port.js';
import { summarizeRun, type RunSummary } from '../../domain/event-store/run-summary.js';
import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { findDuplicateSeq } from './find-duplicate-seq.js';
import { followRun } from './follow-run.js';

// Fake adapter for unit tests and replay demos. Stores copies so callers cannot mutate the log.
export class InMemoryEventStore implements EventStorePort {
  private readonly runs = new Map<string, Map<number, StoredEvent>>();
  private readonly watchers = new Map<string, Set<() => void>>();

  append(events: readonly StoredEvent[]): Promise<void> {
    const duplicate =
      findDuplicateSeq(events) ??
      events.find((event) => this.runs.get(event.runId)?.has(event.seq) === true);
    if (duplicate !== undefined) {
      return Promise.reject(new DuplicateEventSeqError(duplicate.runId, duplicate.seq));
    }

    const touched = new Set<string>();
    for (const event of events) {
      let run = this.runs.get(event.runId);
      if (run === undefined) {
        run = new Map();
        this.runs.set(event.runId, run);
      }
      run.set(event.seq, structuredClone(event));
      touched.add(event.runId);
    }
    for (const runId of touched)
      this.watchers.get(runId)?.forEach((notify) => {
        notify();
      });
    return Promise.resolve();
  }

  readRun(runId: string, fromSeq = 0): Promise<StoredEvent[]> {
    const run = this.runs.get(runId);
    const events = run === undefined ? [] : [...run.values()];
    return Promise.resolve(
      events
        .filter((event) => event.seq >= fromSeq)
        .sort((a, b) => a.seq - b.seq)
        .map((event) => structuredClone(event)),
    );
  }

  subscribe(runId: string, options: SubscribeOptions = {}): AsyncIterable<StoredEvent> {
    return followRun(
      {
        readRun: (id, fromSeq) => this.readRun(id, fromSeq),
        watch: (id, onChange) => {
          let set = this.watchers.get(id);
          if (set === undefined) {
            set = new Set();
            this.watchers.set(id, set);
          }
          set.add(onChange);
          return () => set.delete(onChange);
        },
      },
      runId,
      options.fromSeq ?? 0,
      options.signal,
    );
  }

  async listRuns(limit = 100): Promise<RunSummary[]> {
    const summaries: RunSummary[] = [];
    for (const runId of this.runs.keys()) {
      const summary = summarizeRun(await this.readRun(runId));
      if (summary !== null) summaries.push(summary);
    }
    return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }
}
