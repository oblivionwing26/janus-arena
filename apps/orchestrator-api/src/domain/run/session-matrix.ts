import { BASELINE_PERSONA, type RunConfig } from './run-config.js';
import type { SessionSpec } from './session-spec.js';

/**
 * Every session of a run (F1.7), paired by design: each persona and seed plays every variant,
 * one after the other, and each variant gets the competent baseline for every seed.
 */
export function sessionMatrix(config: RunConfig): SessionSpec[] {
  const slots: Omit<SessionSpec, 'sessionIndex'>[] = [];
  for (const seed of config.seeds) {
    for (const persona of config.personas) {
      for (const { key } of config.variants) {
        slots.push({ variant: key, kind: 'persona', persona, seed });
      }
    }
  }
  for (const seed of config.seeds) {
    for (const { key } of config.variants) {
      slots.push({ variant: key, kind: 'baseline', persona: BASELINE_PERSONA, seed });
    }
  }
  return slots.map((slot, sessionIndex) => ({ sessionIndex, ...slot }));
}
