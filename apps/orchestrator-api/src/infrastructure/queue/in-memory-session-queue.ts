import { InfrastructureError } from '../../domain/run/run-errors.js';
import type {
  RunPlan,
  SessionQueueHandlers,
  SessionResult,
} from '../../domain/run/session-queue-port.js';
import { jobFor } from '../../domain/run/job-for.js';
import type { SessionSpec } from '../../domain/run/session-spec.js';
import type { SessionQueueRuntime } from './session-queue-runtime.js';

export interface InMemorySessionQueueOptions {
  readonly concurrency?: number;
  readonly maxAttempts?: number;
  /** When false, enqueued runs wait for drain(); lets tests act in between. */
  readonly autoRun?: boolean;
}

// Fake adapter for unit tests: same retry and finish semantics as BullMqSessionQueue.
export class InMemorySessionQueue implements SessionQueueRuntime {
  private handlers: SessionQueueHandlers | undefined;
  private readonly pending: RunPlan[] = [];
  private readonly running = new Set<Promise<void>>();
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly autoRun: boolean;

  constructor(options: InMemorySessionQueueOptions = {}) {
    this.concurrency = options.concurrency ?? 2;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.autoRun = options.autoRun ?? true;
  }

  start(handlers: SessionQueueHandlers): Promise<void> {
    this.handlers = handlers;
    return Promise.resolve();
  }

  enqueueRun(plan: RunPlan): Promise<void> {
    if (this.autoRun) this.track(this.process(plan));
    else this.pending.push(plan);
    return Promise.resolve();
  }

  /** Runs every waiting plan and resolves once all runs, including auto-run ones, finished. */
  async drain(): Promise<void> {
    for (const plan of this.pending.splice(0)) this.track(this.process(plan));
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  close(): Promise<void> {
    return this.drain();
  }

  private track(work: Promise<void>): void {
    const tracked = work.finally(() => this.running.delete(tracked));
    this.running.add(tracked);
  }

  private async process(plan: RunPlan): Promise<void> {
    const handlers = this.handlers;
    if (handlers === undefined) throw new Error('InMemorySessionQueue.start() was not called');
    const specs = [...plan.sessions];
    const results: SessionResult[] = [];
    const workers = Array.from({ length: Math.min(this.concurrency, specs.length) }, async () => {
      for (let spec = specs.shift(); spec !== undefined; spec = specs.shift()) {
        results.push(await this.runWithRetries(handlers, plan, spec));
      }
    });
    await Promise.all(workers);
    await handlers.finishRun(
      plan,
      results.sort((a, b) => a.sessionIndex - b.sessionIndex),
    );
  }

  private async runWithRetries(
    handlers: SessionQueueHandlers,
    plan: RunPlan,
    spec: SessionSpec,
  ): Promise<SessionResult> {
    const { sessionIndex } = spec;
    for (let attempt = 1; ; attempt++) {
      try {
        return await handlers.runSession(jobFor(plan, spec, attempt));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (!(error instanceof InfrastructureError) || attempt >= this.maxAttempts) {
          return { sessionIndex, status: 'infra_error', detail };
        }
      }
    }
  }
}
