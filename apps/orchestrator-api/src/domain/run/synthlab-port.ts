import type { StoredEvent } from '../event-store/stored-event.js';
import type { RunConfig } from './run-config.js';

export interface CompletedRun {
  readonly runId: string;
  /** Every event of the run, run.completed included. */
  readonly events: readonly StoredEvent[];
}

/**
 * A whole SynthLab run as one call (F2.4): start it from a run config and wait until it is
 * completed. The automatic A/B chains two of them. Every adapter must pass
 * src/test-support/synthlab-contract.ts.
 */
export interface SynthLabPort {
  /** `onStarted` hears the run id as soon as the run exists, before the wait (F3.9). */
  runAndWait(
    config: RunConfig,
    options?: {
      readonly signal?: AbortSignal;
      readonly onStarted?: (runId: string) => Promise<void>;
    },
  ): Promise<CompletedRun>;
  /** Wait for a run started earlier, maybe by another process, to complete (F3.9). */
  waitFor(runId: string, options?: { readonly signal?: AbortSignal }): Promise<CompletedRun>;
}

export const SYNTHLAB_PORT = Symbol('SynthLabPort');
