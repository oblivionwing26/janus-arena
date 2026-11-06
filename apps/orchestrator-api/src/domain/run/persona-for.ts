import type { RunPlan } from './session-queue-port.js';

/** The persona session `sessionIndex` plays, if the run has personas. */
export function personaFor(plan: RunPlan, sessionIndex: number): string | undefined {
  const personas = plan.personas ?? [];
  return personas.length === 0 ? undefined : personas[sessionIndex % personas.length];
}
