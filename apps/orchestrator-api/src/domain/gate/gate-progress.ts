import {
  GATE_STAGES,
  isKnownEvent,
  type GateStageName,
  type GateStageOutput,
} from '@janus/shared-kernel';

import type { StoredEvent } from '../event-store/stored-event.js';

export type StageProgress =
  | {
      readonly status: 'completed';
      readonly output: GateStageOutput;
      readonly runs: readonly string[];
    }
  | { readonly status: 'skipped'; readonly reason: string; readonly runs: readonly string[] }
  /** Started and never finished: the process died or the stage failed. It runs again. */
  | { readonly status: 'interrupted'; readonly runs: readonly string[] }
  | { readonly status: 'pending'; readonly runs: readonly string[] };

/**
 * Where a gate stands, read from its own run's gate.stage events (F3.9). Every run a stage
 * started is listed, from every attempt, so a resumed gate can count what they spent.
 */
export function gateProgress(events: readonly StoredEvent[]): Map<GateStageName, StageProgress> {
  const progress = new Map<GateStageName, StageProgress>(
    GATE_STAGES.map((stage) => [stage, { status: 'pending', runs: [] }]),
  );
  for (const event of events) {
    if (!isKnownEvent(event) || event.type !== 'gate.stage') continue;
    const { stage, status, runId, output, reason } = event.payload;
    const current = progress.get(stage) ?? { status: 'pending', runs: [] };
    const { runs } = current;
    switch (status) {
      case 'started':
      case 'failed':
        progress.set(stage, { status: 'interrupted', runs });
        break;
      case 'run':
        if (runId !== undefined && !runs.includes(runId)) {
          progress.set(stage, { ...current, runs: [...runs, runId] });
        }
        break;
      case 'completed':
        progress.set(stage, { status: 'completed', output: output ?? {}, runs });
        break;
      case 'skipped':
        progress.set(stage, { status: 'skipped', reason: reason ?? '', runs });
        break;
    }
  }
  return progress;
}
