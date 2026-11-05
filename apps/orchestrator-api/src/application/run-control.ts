import { Budget, type BudgetLimits } from '../domain/llm/budget.js';

interface ActiveRun {
  readonly budget: Budget;
  readonly controller: AbortController;
}

/**
 * In-process state of active runs: the shared budget and the abort signal of their sessions.
 * The worker runs in the API process (F0.10), so one instance serves both; a separate worker
 * process (F1.7) will need this state elsewhere.
 */
export class RunControl {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly stopped = new Set<string>();

  register(runId: string, limits: BudgetLimits): void {
    this.runs.set(runId, { budget: new Budget(limits), controller: new AbortController() });
  }

  budget(runId: string): Budget | undefined {
    return this.runs.get(runId)?.budget;
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
