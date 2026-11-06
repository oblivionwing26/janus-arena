import type { ArtifactStorePort } from '../domain/artifacts/artifact-store-port.js';
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
  /** Screenshots when friction appears (F1.6). */
  readonly artifacts?: ArtifactStorePort;
}

/**
 * One slot of a run (F1.7): the scripted buyer, or a persona or the competent baseline driven
 * by the navigator LLM, on its variant, within the run's concurrency.
 * What the agent does (including not finishing the task) is a result; anything else is the
 * platform failing and is thrown as InfrastructureError so the queue retries it.
 */
export class RunAgentSession {
  constructor(private readonly deps: RunAgentSessionDeps) {}

  async execute(job: SessionJob): Promise<SessionResult> {
    const { runId, spec } = job;
    const { sessionIndex } = spec;
    const { control } = this.deps;
    if (control.isStopped(runId)) return { sessionIndex, status: 'cancelled' };
    if (control.budget(runId)?.state === 'exhausted') {
      return { sessionIndex, status: 'budget_exhausted' };
    }

    const releaseSlot = await control.acquire(runId);
    const signal = control.signal(runId);
    try {
      if (signal.aborted) return { sessionIndex, status: 'cancelled' };
      return spec.kind === 'scripted' || spec.persona === undefined
        ? await this.scripted(job, signal)
        : await this.navigate(job, spec.persona, signal);
    } catch (error) {
      if (signal.aborted) return { sessionIndex, status: 'cancelled' };
      if (error instanceof BudgetExhaustedError)
        return { sessionIndex, status: 'budget_exhausted' };
      if (error instanceof InfrastructureError) throw error;
      if (error instanceof DomainError) {
        return { sessionIndex, status: 'failed', detail: error.message };
      }
      throw new InfrastructureError(error instanceof Error ? error.message : String(error));
    } finally {
      releaseSlot();
    }
  }

  /**
   * Who plays a slot, and with which synthetic data. The data depend only on the run, the seed
   * and the attempt, so an A/B pair plays with identical details; a retry gets a new account
   * instead of hitting "email taken".
   */
  private identity(job: SessionJob, who: string) {
    const { spec, attempt, runId } = job;
    const slot = `s${String(spec.seed)}-a${String(attempt)}`;
    const run = runId.slice(-8).toLowerCase();
    return {
      agentId: `${who}-${spec.variant}-${slot}`,
      email: `${who}-${slot}-${run}@shoplab.test`,
      password: `pw-${run}-${slot}`,
    };
  }

  private async started(job: SessionJob, recorder: RunEventRecorder): Promise<void> {
    const { spec, attempt } = job;
    await recorder.record('session.started', {
      variant: spec.variant,
      kind: spec.kind,
      seed: spec.seed,
      attempt,
      ...(spec.persona === undefined ? {} : { persona: spec.persona }),
    });
  }

  private async scripted(job: SessionJob, signal: AbortSignal): Promise<SessionResult> {
    const { agentId, email, password } = this.identity(job, 'scripted-buyer');
    const recorder = new RunEventRecorder(this.deps.store, job.runId, {
      agentId,
      role: 'scripted',
    });
    await this.started(job, recorder);
    const agent = new ScriptedPurchaseAgent(this.deps.browser, recorder);
    await agent.run({
      baseUrl: job.variant.baseUrl,
      signal,
      buyer: {
        name: `Comprador Programado ${String(job.spec.seed)}`,
        email,
        password,
        address: 'Calle Programada 1, 28001 Madrid',
      },
    });
    return { sessionIndex: job.spec.sessionIndex, status: 'completed' };
  }

  private async navigate(
    job: SessionJob,
    personaId: string,
    signal: AbortSignal,
  ): Promise<SessionResult> {
    const { navigator, control } = this.deps;
    const budget = control.budget(job.runId);
    if (navigator === undefined || budget === undefined) {
      throw new InfrastructureError(`Run ${job.runId} cannot run personas in this process`);
    }
    const found = await navigator.personas.get(personaId);
    const persona = job.maxSteps === undefined ? found : found.withMaxSteps(job.maxSteps);
    const { agentId, email, password } = this.identity(job, persona.id);
    await this.started(
      job,
      new RunEventRecorder(this.deps.store, job.runId, { agentId, role: persona.modelRole }),
    );
    const session = new NavigatorSession({
      browser: this.deps.browser,
      gateway: navigator.gateway,
      store: this.deps.store,
      ...(this.deps.artifacts === undefined ? {} : { artifacts: this.deps.artifacts }),
    });
    const result = await session.run({
      runId: job.runId,
      agentId,
      baseUrl: job.variant.baseUrl,
      persona,
      budget,
      signal,
      task: {
        hasAccount: false,
        details: {
          name: `${persona.name} Sintética`,
          email,
          password,
          address: 'Calle Sintética 1, 28001 Madrid',
        },
      },
    });
    const { sessionIndex } = job.spec;
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
