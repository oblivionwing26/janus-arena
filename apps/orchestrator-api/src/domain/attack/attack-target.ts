import type { ScopedHttpClient } from '../scope/scoped-http-port.js';
import type { BusinessLogicPort } from './business-logic-port.js';
import type { TestSession, TestUserPort } from './test-user-port.js';

/**
 * Gives the victim of an attack something worth stealing (F3.3): records only that user owns,
 * holding values (canaries) the leak oracle can recognise in someone else's response.
 */
export interface VictimDataPort {
  /** Creates the victim's data and returns its canaries. */
  seed(victim: TestSession): Promise<readonly string[]>;
}

/** What an attack needs from a specific target, bound to the run's guarded client. */
export interface AttackTarget {
  readonly users: TestUserPort;
  readonly victim: VictimDataPort;
  readonly businessLogic: BusinessLogicPort;
}

export type AttackTargetFactory = (client: ScopedHttpClient, origin: string) => AttackTarget;
