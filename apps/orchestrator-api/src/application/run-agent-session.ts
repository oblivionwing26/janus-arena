import { newUlid } from '@janus/shared-kernel';

import type { BrowserPort } from '../domain/browser/browser-port.js';
import { DomainError } from '../domain/errors/domain-error.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { BudgetExhaustedError } from '../domain/llm/budget-exhausted-error.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { PersonaCatalogPort } from '../domain/persona/persona-catalog-port.js';
import { InfrastructureError } from '../domain/run/run-errors.js';
import type { SessionJob, SessionResult } from '../domain/run/session-queue-port.js';
import { NavigatorSession } from './navigator-session.js';
import type { RunControl } from './run-control.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ScriptedPurchaseAgent } from './scripted-purchase-agent.js';

export interface RunAgentSessionDeps {
  readonly store: EventStorePort;
  readonly browser: BrowserPort;
  readonly control: RunControl;
  /** Needed only for sessions that play a persona (F1.4). */
  readonly navigator?: { readonly gateway: LLMGatewayPort; readonly personas: PersonaCatalogPort };
}

/**
 * One agent session of a run: the scripted buyer, or a persona driven by the navigator LLM.
 * What the agent does (including not finishing the task) is a result; anything else is the
 * platform failing and is thrown as InfrastructureError so the queue retries it.
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
    // Synthetic data; a retry registers a new account instead of hitting "email taken".
    const tag = `${String(sessionIndex)}-${String(job.attempt)}-${runId.toLowerCase()}`;
    try {
      return job.persona === undefined
        ? await this.scripted(job, tag, signal)
        : await this.navigate(job, job.persona, tag, signal);
    } catch (error) {
      if (signal.aborted) return { sessionIndex, status: 'cancelled' };
      if (error instanceof BudgetExhaustedError)
        return { sessionIndex, status: 'budget_exhausted' };
      if (error instanceof InfrastructureError) throw error;
      if (error instanceof DomainError) {
        return { sessionIndex, status: 'failed', detail: error.message };
      }
      throw new InfrastructureError(error instanceof Error ? error.message : String(error));
    }
  }

  private async scripted(
    job: SessionJob,
    tag: string,
    signal: AbortSignal,
  ): Promise<SessionResult> {
    const recorder = new RunEventRecorder(this.deps.store, job.runId, {
      agentId: `scripted-buyer-${String(job.sessionIndex)}`,
      role: 'scripted',
    });
    const agent = new ScriptedPurchaseAgent(this.deps.browser, recorder);
    await agent.run({
      baseUrl: job.baseUrl,
      signal,
      buyer: {
        name: `Comprador Programado ${String(job.sessionIndex)}`,
        email: `buyer-${tag}@shoplab.test`,
        password: newUlid().slice(10),
        address: 'Calle Programada 1, 28001 Madrid',
      },
    });
    return { sessionIndex: job.sessionIndex, status: 'completed' };
  }

  private async navigate(
    job: SessionJob,
    personaId: string,
    tag: string,
    signal: AbortSignal,
  ): Promise<SessionResult> {
    const { navigator, control } = this.deps;
    const budget = control.budget(job.runId);
    if (navigator === undefined || budget === undefined) {
      throw new InfrastructureError(`Run ${job.runId} cannot run personas in this process`);
    }
    const persona = await navigator.personas.get(personaId);
    const session = new NavigatorSession({
      browser: this.deps.browser,
      gateway: navigator.gateway,
      store: this.deps.store,
    });
    const result = await session.run({
      runId: job.runId,
      agentId: `${persona.id}-${String(job.sessionIndex)}`,
      baseUrl: job.baseUrl,
      persona,
      budget,
      signal,
      task: {
        hasAccount: false,
        details: {
          name: `${persona.name} Sintética`,
          email: `${persona.id}-${tag}@shoplab.test`,
          password: newUlid().slice(10),
          address: 'Calle Sintética 1, 28001 Madrid',
        },
      },
    });
    const { sessionIndex } = job;
    switch (result.outcome) {
      case 'success':
        return { sessionIndex, status: 'completed' };
      case 'budget_exhausted':
        return { sessionIndex, status: 'budget_exhausted' };
      case 'abandon':
      case 'patience_exhausted':
        return {
          sessionIndex,
          status: 'failed',
          detail: result.reason ?? result.outcome.replace('_', ' '),
        };
    }
  }
}
