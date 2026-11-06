import { newUlid } from '@janus/shared-kernel';

import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { BudgetLimits } from '../domain/llm/budget.js';
import type { PersonaCatalogPort } from '../domain/persona/persona-catalog-port.js';
import { PersonaNotFoundError } from '../domain/persona/persona-not-found-error.js';
import type { SessionQueuePort } from '../domain/run/session-queue-port.js';
import { variantIdFor } from '../domain/run/variant-id-for.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import { assertValidVariant } from '../domain/sandbox/variant-spec.js';
import type { RunControl } from './run-control.js';
import { RunEventRecorder } from './run-event-recorder.js';

export interface StartRunInput {
  readonly target: string;
  readonly ref: string;
  readonly sessions: number;
  readonly budget: BudgetLimits;
  /** Persona ids for the sessions to play in turn (F1.4); omit for the scripted agent. */
  readonly personas?: readonly string[] | undefined;
}

export interface StartRunDeps {
  readonly store: EventStorePort;
  readonly sandbox: SandboxPort;
  readonly queue: SessionQueuePort;
  readonly control: RunControl;
  /** Needed only for runs with personas. */
  readonly personas?: PersonaCatalogPort;
  readonly newRunId?: () => string;
}

export const ORCHESTRATOR_ACTOR = { agentId: 'orchestrator', role: 'orchestrator' } as const;

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/**
 * Creates a run (run.started), then in the background brings its variant up and queues its
 * sessions. Returns as soon as the run exists; `launched` settles when the launch is done.
 */
export class StartRun {
  constructor(private readonly deps: StartRunDeps) {}

  async execute(input: StartRunInput): Promise<{ runId: string; launched: Promise<void> }> {
    const runId = (this.deps.newRunId ?? newUlid)();
    const variant = { id: variantIdFor(runId), target: input.target, ref: input.ref };
    assertValidVariant(variant);
    // Unknown personas fail before the run exists (PersonaNotFoundError).
    const personas = input.personas ?? [];
    for (const id of personas) {
      if (this.deps.personas === undefined) throw new PersonaNotFoundError(id);
      await this.deps.personas.get(id);
    }

    const recorder = new RunEventRecorder(this.deps.store, runId, ORCHESTRATOR_ACTOR);
    this.deps.control.register(runId, input.budget);
    await recorder.record('run.started', { budget: input.budget });

    const launched = this.launch(runId, variant, input.sessions, personas, recorder);
    return { runId, launched };
  }

  private async launch(
    runId: string,
    variant: { id: string; target: string; ref: string },
    sessions: number,
    personas: readonly string[],
    recorder: RunEventRecorder,
  ): Promise<void> {
    const { sandbox, queue, control } = this.deps;
    let baseUrl: string;
    try {
      ({ baseUrl } = await sandbox.up(variant));
    } catch (error) {
      if (!control.isStopped(runId)) {
        await recorder.record('run.completed', {
          outcome: 'error',
          reason: `Sandbox failed to start: ${message(error)}`,
        });
      }
      control.release(runId);
      return;
    }

    // Stopped while the variant was starting: StopRun already recorded run.completed.
    if (control.isStopped(runId)) {
      await sandbox.down(variant.id);
      return;
    }

    try {
      await queue.enqueueRun({
        runId,
        variantId: variant.id,
        baseUrl,
        sessions,
        ...(personas.length === 0 ? {} : { personas }),
      });
    } catch (error) {
      await sandbox.down(variant.id);
      await recorder.record('run.completed', {
        outcome: 'error',
        reason: `Could not queue sessions: ${message(error)}`,
      });
      control.release(runId);
    }
  }
}
