import { newUlid } from '@janus/shared-kernel';

import type { BrowserPort } from '../domain/browser/browser-port.js';
import { DomainError } from '../domain/errors/domain-error.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { BudgetExhaustedError } from '../domain/llm/budget-exhausted-error.js';
import { InfrastructureError } from '../domain/run/run-errors.js';
import type { SessionJob, SessionResult } from '../domain/run/session-queue-port.js';
import type { RunControl } from './run-control.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ScriptedPurchaseAgent } from './scripted-purchase-agent.js';

export interface RunAgentSessionDeps {
  readonly store: EventStorePort;
  readonly browser: BrowserPort;
  readonly control: RunControl;
}

/**
 * One agent session of a run. What the agent does (including not finishing the task) is a
 * result; anything else is the platform failing and is thrown as InfrastructureError so the
 * queue retries it.
 */
export class RunAgentSession {
  constructor(private readonly deps: RunAgentSessionDeps) {}

  async execute(job: SessionJob): Promise<SessionResult> {
    const { sessionIndex, runId } = job;
    const { control } = this.deps;
    if (control.isStopped(runId)) return { sessionIndex, status: 'cancelled' };
    if (control.budget(runId)?.state === 'exhausted') {
      return { sessionIndex, status: 'budget_exhausted' };
    }

    const signal = control.signal(runId);
    const recorder = new RunEventRecorder(this.deps.store, runId, {
      agentId: `scripted-buyer-${String(sessionIndex)}`,
      role: 'scripted',
    });
    const agent = new ScriptedPurchaseAgent(this.deps.browser, recorder);
    // Synthetic buyer; a retry registers a new account instead of hitting "email taken".
    const tag = `${String(sessionIndex)}-${String(job.attempt)}-${runId.toLowerCase()}`;
    try {
      await agent.run({
        baseUrl: job.baseUrl,
        signal,
        buyer: {
          name: `Comprador Programado ${String(sessionIndex)}`,
          email: `buyer-${tag}@shoplab.test`,
          password: newUlid().slice(10),
          address: 'Calle Programada 1, 28001 Madrid',
        },
      });
      return { sessionIndex, status: 'completed' };
    } catch (error) {
      if (signal.aborted) return { sessionIndex, status: 'cancelled' };
      if (error instanceof BudgetExhaustedError)
        return { sessionIndex, status: 'budget_exhausted' };
      if (error instanceof DomainError) {
        return { sessionIndex, status: 'failed', detail: error.message };
      }
      throw new InfrastructureError(error instanceof Error ? error.message : String(error));
    }
  }
}
