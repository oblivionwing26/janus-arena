/**
 * One slot of a run (F1.7): which variant, who plays it and with which seed. The same
 * persona and seed on two variants is an A/B pair; `baseline` is the competent reference.
 */
export interface SessionSpec {
  readonly sessionIndex: number;
  /** Variant key in the run, e.g. `a` or `b`. */
  readonly variant: string;
  readonly kind: 'scripted' | 'persona' | 'baseline' | 'saboteur';
  /** Persona id; absent for the scripted buyer. */
  readonly persona?: string;
  /** Fixes the session's synthetic data, so a pair plays with identical details. */
  readonly seed: number;
  /** Task id the slot plays (F1.9); absent when it plays the persona's goal. */
  readonly task?: string;
  /**
   * The address the session presents to the target (X-Forwarded-For, simulated, F4.1). A pair
   * presents the same one on both variants: the address belongs to the slot.
   */
  readonly clientIp?: string;
  /** How fast a saboteur sends (F4.1); absent for every other kind. */
  readonly requestsPerSecond?: number;
}
