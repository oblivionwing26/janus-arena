/** What a run hands to the queue once its variant is up. */
export interface RunPlan {
  readonly runId: string;
  readonly variantId: string;
  readonly baseUrl: string;
  readonly sessions: number;
}

export interface SessionJob {
  readonly runId: string;
  readonly variantId: string;
  readonly baseUrl: string;
  readonly sessionIndex: number;
  /** 1 on the first try, then 2, 3... after infrastructure failures. */
  readonly attempt: number;
}

/**
 * How a session ended. `failed` is the agent not managing the task (friction, never retried);
 * `infra_error` is the platform failing after every retry (never counted as friction).
 */
export type SessionStatus =
  'completed' | 'failed' | 'budget_exhausted' | 'cancelled' | 'infra_error';

export interface SessionResult {
  readonly sessionIndex: number;
  readonly status: SessionStatus;
  readonly detail?: string;
}

/**
 * Work the queue runs. `runSession` returns a result for anything the agent did, and throws
 * InfrastructureError only for platform failures, which the queue retries.
 */
export interface SessionQueueHandlers {
  runSession(job: SessionJob): Promise<SessionResult>;
  /** Called once per run, after every session has a result. */
  finishRun(plan: RunPlan, results: readonly SessionResult[]): Promise<void>;
}

/** Every adapter must pass src/test-support/session-queue-contract.ts. */
export interface SessionQueuePort {
  enqueueRun(plan: RunPlan): Promise<void>;
}

export const SESSION_QUEUE_PORT = Symbol('SessionQueuePort');
