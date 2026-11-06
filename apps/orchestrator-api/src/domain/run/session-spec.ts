/**
 * One slot of a run (F1.7): which variant, who plays it and with which seed. The same
 * persona and seed on two variants is an A/B pair; `baseline` is the competent reference.
 */
export interface SessionSpec {
  readonly sessionIndex: number;
  /** Variant key in the run, e.g. `a` or `b`. */
  readonly variant: string;
  readonly kind: 'scripted' | 'persona' | 'baseline';
  /** Persona id; absent for the scripted buyer. */
  readonly persona?: string;
  /** Fixes the session's synthetic data, so a pair plays with identical details. */
  readonly seed: number;
}
