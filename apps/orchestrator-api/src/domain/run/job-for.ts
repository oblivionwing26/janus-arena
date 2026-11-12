import type { RunPlan, SessionJob } from './session-queue-port.js';
import type { SessionSpec } from './session-spec.js';

/** The job of one session of a plan. */
export function jobFor(plan: RunPlan, spec: SessionSpec, attempt: number): SessionJob {
  const variant = plan.variants.find((candidate) => candidate.key === spec.variant);
  if (variant === undefined) throw new Error(`Run ${plan.runId} has no variant ${spec.variant}`);
  const task =
    spec.task === undefined
      ? undefined
      : plan.tasks?.find((candidate) => candidate.id === spec.task);
  if (spec.task !== undefined && task === undefined) {
    throw new Error(`Run ${plan.runId} has no task ${spec.task}`);
  }
  return {
    runId: plan.runId,
    // Plans queued before F3.5a were all ShopLab's.
    target: plan.target ?? 'shoplab',
    spec,
    variant,
    attempt,
    ...(plan.maxSteps === undefined ? {} : { maxSteps: plan.maxSteps }),
    ...(task === undefined ? {} : { task, taskNumber: (plan.tasks?.indexOf(task) ?? 0) + 1 }),
  };
}
