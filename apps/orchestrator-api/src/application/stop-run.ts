import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { isRunCompleted } from '../domain/event-store/run-summary.js';
import { RunNotFoundError } from '../domain/run/run-errors.js';
import { variantIdFor } from '../domain/run/variant-id-for.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import type { RunControl } from './run-control.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from './start-run.js';

export interface StopRunDeps {
  readonly store: EventStorePort;
  readonly sandbox: SandboxPort;
  readonly control: RunControl;
}

/**
 * Stops a run: aborts its sessions, tears its variant down and records run.completed with
 * reason "stopped by user". Stopping a completed run does nothing.
 */
export class StopRun {
  constructor(private readonly deps: StopRunDeps) {}

  async execute(runId: string): Promise<void> {
    const { store, sandbox, control } = this.deps;
    const events = await store.readRun(runId);
    if (events.length === 0) throw new RunNotFoundError(runId);
    if (events.some(isRunCompleted)) return;

    control.stop(runId);
    await sandbox.down(variantIdFor(runId));
    await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.completed', {
      outcome: 'error',
      reason: 'stopped by user',
    });
  }
}
