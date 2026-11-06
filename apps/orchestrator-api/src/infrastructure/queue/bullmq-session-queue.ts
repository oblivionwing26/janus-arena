import { FlowProducer, UnrecoverableError, Worker, type Job, type RedisOptions } from 'bullmq';

import { InfrastructureError } from '../../domain/run/run-errors.js';
import type {
  RunPlan,
  SessionQueueHandlers,
  SessionResult,
} from '../../domain/run/session-queue-port.js';
import { personaFor } from '../../domain/run/persona-for.js';
import type { SessionQueueRuntime } from './session-queue-runtime.js';

export const AGENT_SESSIONS_QUEUE = 'agent-sessions';

// Finished jobs are only bookkeeping (the event log is the record); keep them for a day.
const RETENTION = { removeOnComplete: { age: 86_400 }, removeOnFail: { age: 86_400 } } as const;

export interface BullMqSessionQueueOptions {
  readonly redisUrl: string;
  readonly concurrency?: number;
  readonly maxAttempts?: number;
  readonly backoffMs?: number;
  /** Redis key prefix; tests use their own so they never see real jobs. */
  readonly prefix?: string;
}

type SessionData = RunPlan & { readonly sessionIndex: number };

function redisOptions(url: string): RedisOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password === '' ? {} : { password: decodeURIComponent(parsed.password) }),
    // Required by BullMQ workers (blocking commands).
    maxRetriesPerRequest: null,
  };
}

/** Last "-<n>" of a session job key, e.g. "bull:agent-sessions:session-<runId>-2" -> 2. */
function sessionIndexOf(key: string): number {
  return Number(key.slice(key.lastIndexOf('-') + 1));
}

/**
 * The agent-sessions queue (BullMQ flow): each run is a `finish-run` parent with one `session`
 * child per agent. Children retry with exponential backoff, but only on InfrastructureError;
 * the parent runs once every child has a result or has used up its attempts.
 */
export class BullMqSessionQueue implements SessionQueueRuntime {
  private readonly connection: RedisOptions;
  private readonly flow: FlowProducer;
  private worker: Worker | undefined;
  private readonly prefix: string;

  constructor(private readonly options: BullMqSessionQueueOptions) {
    this.connection = redisOptions(options.redisUrl);
    this.prefix = options.prefix ?? 'janus';
    this.flow = new FlowProducer({ connection: this.connection, prefix: this.prefix });
  }

  start(handlers: SessionQueueHandlers): Promise<void> {
    this.worker = new Worker(AGENT_SESSIONS_QUEUE, (job: Job) => this.process(job, handlers), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: this.options.concurrency ?? 2,
    });
    return this.worker.waitUntilReady().then(() => undefined);
  }

  async enqueueRun(plan: RunPlan): Promise<void> {
    await this.flow.add({
      name: 'finish-run',
      queueName: AGENT_SESSIONS_QUEUE,
      data: plan,
      opts: { jobId: `finish-${plan.runId}`, ...RETENTION },
      children: Array.from({ length: plan.sessions }, (_, sessionIndex) => ({
        name: 'session',
        queueName: AGENT_SESSIONS_QUEUE,
        data: { ...plan, sessionIndex } satisfies SessionData,
        opts: {
          jobId: `session-${plan.runId}-${String(sessionIndex)}`,
          attempts: this.options.maxAttempts ?? 3,
          backoff: { type: 'exponential', delay: this.options.backoffMs ?? 1000 },
          ignoreDependencyOnFailure: true,
          ...RETENTION,
        },
      })),
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.flow.close();
  }

  private async process(job: Job, handlers: SessionQueueHandlers): Promise<unknown> {
    if (job.name === 'session') {
      const data = job.data as SessionData;
      const { runId, variantId, baseUrl, sessionIndex } = data;
      const persona = personaFor(data, sessionIndex);
      try {
        return await handlers.runSession({
          runId,
          variantId,
          baseUrl,
          sessionIndex,
          attempt: job.attemptsMade + 1,
          ...(persona === undefined ? {} : { persona }),
        });
      } catch (error) {
        if (error instanceof InfrastructureError) throw error;
        throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
      }
    }

    const plan = job.data as RunPlan;
    const values = (await job.getChildrenValues()) as Record<string, SessionResult>;
    const failures = (await job.getIgnoredChildrenFailures()) as Record<string, string>;
    const results: SessionResult[] = [
      ...Object.values(values),
      ...Object.entries(failures).map(([key, detail]) => ({
        sessionIndex: sessionIndexOf(key),
        status: 'infra_error' as const,
        detail,
      })),
    ];
    await handlers.finishRun(
      plan,
      results.sort((a, b) => a.sessionIndex - b.sessionIndex),
    );
    return null;
  }
}
