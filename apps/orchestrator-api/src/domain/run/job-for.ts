import type { RunPlan, SessionJob } from './session-queue-port.js';
import type { SessionSpec } from './session-spec.js';

/** The job of one session of a plan. */
export function jobFor(plan: RunPlan, spec: SessionSpec, attempt: number): SessionJob {
  const variant = plan.variants.find((candidate) => candidate.key === spec.variant);
  if (variant === undefined) throw new Error(`Run ${plan.runId} has no variant ${spec.variant}`);
  return {
    runId: plan.runId,
    spec,
    variant,
    attempt,
    ...(plan.maxSteps === undefined ? {} : { maxSteps: plan.maxSteps }),
  };
}
