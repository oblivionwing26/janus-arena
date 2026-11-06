import { newUlid } from '@janus/shared-kernel';

import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { BudgetLimits } from '../domain/llm/budget.js';
import type { PersonaCatalogPort } from '../domain/persona/persona-catalog-port.js';
import { PersonaNotFoundError } from '../domain/persona/persona-not-found-error.js';
import { assertValidRunConfig, type RunConfig } from '../domain/run/run-config.js';
import { sessionMatrix } from '../domain/run/session-matrix.js';
import type { PlannedVariant, SessionQueuePort } from '../domain/run/session-queue-port.js';
import type { SessionSpec } from '../domain/run/session-spec.js';
import { variantIdFor } from '../domain/run/variant-id-for.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import { assertValidVariant, type VariantSpec } from '../domain/sandbox/variant-spec.js';
import type { RunControl } from './run-control.js';
import { RunEventRecorder } from './run-event-recorder.js';

export interface StartRunInput {
  readonly target: string;
  readonly variants: readonly { readonly key: string; readonly ref: string }[];
  readonly sessions: readonly SessionSpec[];
  readonly budget: BudgetLimits;
  readonly maxSteps?: number | undefined;
  readonly concurrency?: number | undefined;
}

/** A run from a run file (F1.7): validated, paired, a baseline per variant and seed. */
export function runInputFromConfig(config: RunConfig): StartRunInput {
  assertValidRunConfig(config);
  return {
    target: config.target,
    variants: config.variants,
    sessions: sessionMatrix(config),
    budget: config.budget,
    maxSteps: config.maxSteps,
    concurrency: config.concurrency,
  };
}

/**
 * The single-variant body of F0.10/F1.4: `sessions` scripted buyers, or sessions playing
 * `personas` in turn, all on variant `a`, seed = session index.
 */
export function runInputFromSessions(input: {
  readonly target: string;
  readonly ref: string;
  readonly sessions: number;
  readonly budget: BudgetLimits;
  readonly personas?: readonly string[] | undefined;
}): StartRunInput {
  const personas = input.personas ?? [];
  return {
    target: input.target,
    variants: [{ key: 'a', ref: input.ref }],
    budget: input.budget,
    sessions: Array.from({ length: input.sessions }, (_, sessionIndex): SessionSpec => {
      const persona = personas[sessionIndex % Math.max(1, personas.length)];
      return persona === undefined
        ? { sessionIndex, variant: 'a', kind: 'scripted', seed: sessionIndex }
        : { sessionIndex, variant: 'a', kind: 'persona', persona, seed: sessionIndex };
    }),
  };
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
 * Creates a run (run.started), then in the background brings its variants up together and
 * queues its sessions. Returns as soon as the run exists; `launched` settles when the launch
 * is done.
 */
export class StartRun {
  constructor(private readonly deps: StartRunDeps) {}

  async execute(input: StartRunInput): Promise<{ runId: string; launched: Promise<void> }> {
    const runId = (this.deps.newRunId ?? newUlid)();
    const variants: (VariantSpec & { key: string })[] = input.variants.map(({ key, ref }) => ({
      key,
      id: variantIdFor(runId, key),
      target: input.target,
      ref,
    }));
    variants.forEach(assertValidVariant);
    // Unknown personas fail before the run exists (PersonaNotFoundError).
    const personas = new Set(
      input.sessions.flatMap((spec) => (spec.persona === undefined ? [] : [spec.persona])),
    );
    for (const id of personas) {
      if (this.deps.personas === undefined) throw new PersonaNotFoundError(id);
      await this.deps.personas.get(id);
    }

    const recorder = new RunEventRecorder(this.deps.store, runId, ORCHESTRATOR_ACTOR);
    this.deps.control.register(runId, input.budget, {
      variantKeys: variants.map((variant) => variant.key),
      ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
    });
    await recorder.record('run.started', { budget: input.budget });

    const launched = this.launch(runId, variants, input, recorder);
    return { runId, launched };
  }

  private async launch(
    runId: string,
    variants: readonly (VariantSpec & { key: string })[],
    input: StartRunInput,
    recorder: RunEventRecorder,
  ): Promise<void> {
    const { sandbox, queue, control } = this.deps;
    const downAll = () => Promise.all(variants.map((variant) => sandbox.down(variant.id)));
    const started = await Promise.allSettled(variants.map((variant) => sandbox.up(variant)));
    const failure = started.find((result) => result.status === 'rejected');
    if (failure !== undefined) {
      await downAll();
      if (!control.isStopped(runId)) {
        await recorder.record('run.completed', {
          outcome: 'error',
          reason: `Sandbox failed to start: ${message(failure.reason)}`,
        });
      }
      control.release(runId);
      return;
    }

    // Stopped while the variants were starting: StopRun already recorded run.completed.
    if (control.isStopped(runId)) {
      await downAll();
      return;
    }

    const planned: PlannedVariant[] = variants.map((variant, index) => {
      const result = started[index];
      if (result?.status !== 'fulfilled') throw new Error('unreachable: every variant started');
      return { key: variant.key, variantId: variant.id, baseUrl: result.value.baseUrl };
    });
    try {
      await queue.enqueueRun({
        runId,
        variants: planned,
        sessions: input.sessions,
        ...(input.maxSteps === undefined ? {} : { maxSteps: input.maxSteps }),
      });
    } catch (error) {
      await downAll();
      await recorder.record('run.completed', {
        outcome: 'error',
        reason: `Could not queue sessions: ${message(error)}`,
      });
      control.release(runId);
    }
  }
}
