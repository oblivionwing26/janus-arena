import { Budget, type BudgetLimits } from '../domain/llm/budget.js';

interface ActiveRun {
  readonly budget: Budget;
  readonly controller: AbortController;
  readonly variantKeys: readonly string[];
  readonly concurrency: number;
  playing: number;
  readonly waiting: (() => void)[];
}

export interface RunRegistration {
  /** Variant keys of the run, to tear them all down on stop. Defaults to `a`. */
  readonly variantKeys?: readonly string[];
  /** Sessions of this run playing at once (F1.7). Unlimited by default. */
  readonly concurrency?: number;
}

/**
 * In-process state of active runs: the shared budget, the abort signal of their sessions,
 * their variants and how many sessions may play at once. The worker runs in the API process
 * (F0.10), so one instance serves both; separate worker processes will need this elsewhere.
 */
export class RunControl {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly stopped = new Set<string>();

  register(runId: string, limits: BudgetLimits, registration: RunRegistration = {}): void {
    this.runs.set(runId, {
      budget: new Budget(limits),
      controller: new AbortController(),
      variantKeys: registration.variantKeys ?? ['a'],
      concurrency: registration.concurrency ?? Number.POSITIVE_INFINITY,
      playing: 0,
      waiting: [],
    });
  }

  budget(runId: string): Budget | undefined {
    return this.runs.get(runId)?.budget;
  }

  variantKeys(runId: string): readonly string[] {
    return this.runs.get(runId)?.variantKeys ?? ['a'];
  }

  /**
   * Waits until the run has a free slot, then takes it; the returned function gives it back.
   * A run unknown to this process is not limited.
   */
  async acquire(runId: string): Promise<() => void> {
    const run = this.runs.get(runId);
    if (run === undefined) return () => undefined;
    if (run.playing >= run.concurrency) {
      await new Promise<void>((resolve) => run.waiting.push(resolve));
    }
    run.playing += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      run.playing -= 1;
      run.waiting.shift()?.();
    };
  }

  /** Aborts when the run is stopped. A run unknown to this process gets a live signal. */
  signal(runId: string): AbortSignal {
    return this.runs.get(runId)?.controller.signal ?? new AbortController().signal;
  }

  stop(runId: string): void {
    this.stopped.add(runId);
    this.runs.get(runId)?.controller.abort(new Error('stopped by user'));
  }

  isStopped(runId: string): boolean {
    return this.stopped.has(runId);
  }

  release(runId: string): void {
    this.runs.delete(runId);
  }
}
