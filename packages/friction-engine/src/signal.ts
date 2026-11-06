import type { FrictionSignalEvent } from '@janus/shared-kernel';

export type FrictionDetector = FrictionSignalEvent['payload']['detector'];
export type FrictionSeverity = FrictionSignalEvent['payload']['severity'];

/**
 * A detected friction signal, ready to become a `friction.signal` payload. The caller adds the
 * envelope (id, seq, actor). Always points at the events that prove it.
 */
export interface FrictionSignalDraft {
  readonly detector: FrictionDetector;
  readonly severity: FrictionSeverity;
  readonly agentId: string;
  readonly evidenceEventIds: readonly string[];
  readonly stepIndex?: number;
  readonly url?: string;
}
