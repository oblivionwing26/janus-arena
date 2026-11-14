import { isRunCompleted } from '../../domain/event-store/run-summary.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { RunConfig } from '../../domain/run/run-config.js';
import type { CompletedRun, SynthLabPort } from '../../domain/run/synthlab-port.js';

/** The run file body POST /runs takes (runs/*.yaml), from a run config. */
export function runConfigBody(config: RunConfig): Record<string, unknown> {
  return {
    target: config.target,
    variants: config.variants.map((variant) => ({
      id: variant.key,
      ref: variant.ref,
      ...(variant.repo === undefined ? {} : { repo: variant.repo }),
      ...(variant.base === undefined ? {} : { base: variant.base }),
      ...(variant.env === undefined ? {} : { env: variant.env }),
    })),
    personas: config.personas,
    ...(config.tasks === undefined ? {} : { tasks: config.tasks }),
    seeds: config.seeds,
    ...(config.maxSteps === undefined ? {} : { maxSteps: config.maxSteps }),
    budget: config.budget,
    ...(config.concurrency === undefined ? {} : { concurrency: config.concurrency }),
    ...(config.saboteurs === undefined ? {} : { saboteurs: config.saboteurs }),
    ...(config.clientIps === undefined ? {} : { clientIps: config.clientIps }),
  };
}

/**
 * SynthLabPort over the orchestrator's HTTP API (F2.4): POST /runs, then follow the run in the
 * event store until run.completed. The API (`pnpm dev`) plays the sessions; this side only
 * starts and watches.
 */
export class HttpSynthLab implements SynthLabPort {
  constructor(
    private readonly store: EventStorePort,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async runAndWait(
    config: RunConfig,
    options: {
      readonly signal?: AbortSignal;
      readonly onStarted?: (runId: string) => Promise<void>;
    } = {},
  ): Promise<CompletedRun> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(runConfigBody(config)),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`The orchestrator refused the run (${String(response.status)}): ${text}`);
    }
    const { runId } = JSON.parse(text) as { runId?: unknown };
    if (typeof runId !== 'string') throw new Error(`Unexpected answer from POST /runs: ${text}`);
    await options.onStarted?.(runId);
    return this.waitFor(runId, options);
  }

  async waitFor(
    runId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<CompletedRun> {
    for await (const event of this.store.subscribe(runId, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })) {
      if (isRunCompleted(event)) break;
    }
    return { runId, events: await this.store.readRun(runId) };
  }
}
