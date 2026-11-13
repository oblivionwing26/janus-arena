import { GATE_STAGES, type GateStageName } from '@janus/shared-kernel';

import { InvalidGateBudgetError } from './invalid-gate-budget-error.js';

/**
 * The gate's global budget split by stage (F3.9). Each stage gets its share of the total plus
 * whatever the earlier stages left unspent, never more than what is left of the total. A stage
 * with no share (a deterministic one) gets only what the earlier ones left.
 */
export class GateBudget {
  constructor(
    readonly totalEur: number,
    private readonly shares: Readonly<Partial<Record<GateStageName, number>>>,
  ) {
    const values = Object.values(shares);
    if (!(totalEur > 0)) throw new InvalidGateBudgetError('the total must be positive');
    if (values.some((share) => !(share >= 0))) {
      throw new InvalidGateBudgetError('every share must be zero or more');
    }
    if (values.reduce((sum, share) => sum + share, 0) > 1 + 1e-9) {
      throw new InvalidGateBudgetError('the shares add up to more than the total');
    }
  }

  /** What is left of the total after `spentEur`. */
  remaining(spentEur: number): number {
    return Math.max(0, this.totalEur - spentEur);
  }

  /** What `stage` may spend when the gate has spent `spentEur` so far. */
  allowance(stage: GateStageName, spentEur: number): number {
    const upTo = GATE_STAGES.slice(0, GATE_STAGES.indexOf(stage) + 1);
    const cumulative = upTo.reduce((sum, each) => sum + (this.shares[each] ?? 0), 0);
    return Math.max(0, Math.min(this.remaining(spentEur), cumulative * this.totalEur - spentEur));
  }
}
