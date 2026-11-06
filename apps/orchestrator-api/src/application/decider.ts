import type { Observation } from '@janus/observation-builder';
import type { ActorRole } from '@janus/shared-kernel';

import type { ActionResult } from './action-executor.js';
import type { WorkingMemory } from './working-memory.js';

export interface DecisionInput {
  readonly stepIndex: number;
  readonly observation: Observation;
  readonly lastResult: ActionResult | null;
  readonly memory: WorkingMemory;
}

export interface Decision {
  /** Raw action, validated by the executor. */
  readonly action: unknown;
  readonly thought?: string;
}

/**
 * Who chooses the next action in the navigator loop: the LLM playing a persona, or a fixed
 * script (F1.6 probes). Everything else (observing, acting, telemetry, events) is the same.
 */
export interface Decider {
  /** Actor role of the session's events. */
  readonly role: ActorRole;
  decide(input: DecisionInput): Promise<Decision>;
}
