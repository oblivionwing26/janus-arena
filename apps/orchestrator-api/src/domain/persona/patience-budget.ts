import { InvalidPersonaError } from './invalid-persona-error.js';

export interface PatienceLimits {
  readonly maxSteps: number;
  readonly maxSeconds: number;
}

/**
 * How long a persona keeps trying before giving up. Running out counts as abandonment (F1.4),
 * whichever limit is reached first.
 */
export class PatienceBudget implements PatienceLimits {
  readonly maxSteps: number;
  readonly maxSeconds: number;

  constructor(limits: PatienceLimits, personaId = '<patience>') {
    if (!Number.isInteger(limits.maxSteps) || limits.maxSteps < 1 || limits.maxSteps > 200) {
      throw new InvalidPersonaError(personaId, 'maxSteps must be an integer from 1 to 200');
    }
    if (limits.maxSeconds < 10 || limits.maxSeconds > 3600) {
      throw new InvalidPersonaError(personaId, 'maxSeconds must be from 10 to 3600');
    }
    this.maxSteps = limits.maxSteps;
    this.maxSeconds = limits.maxSeconds;
  }

  isExhausted(used: { readonly steps: number; readonly elapsedMs: number }): boolean {
    return used.steps >= this.maxSteps || used.elapsedMs >= this.maxSeconds * 1000;
  }
}
