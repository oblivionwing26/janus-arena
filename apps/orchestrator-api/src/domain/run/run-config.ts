import type { BudgetLimits } from '../llm/budget.js';
import type { TaskSpec } from '../task/task-spec.js';
import { InvalidRunConfigError } from './invalid-run-config-error.js';

export const BASELINE_PERSONA = 'competent-baseline';

/** A run as declared in a run file (runs/*.yaml, F1.7). */
export interface RunConfig {
  readonly target: string;
  /** One to four variants; the same personas and seeds play every one of them. */
  readonly variants: readonly {
    readonly key: string;
    readonly ref: string;
    /** A local clone (file://) holding a generated variant (F2.4); the target's repo otherwise. */
    readonly repo?: string;
  }[];
  /**
   * Persona ids. The competent baseline is always added to each variant, never listed; an
   * empty list makes a baseline-only run (F1.9).
   */
  readonly personas: readonly string[];
  /** Tasks every slot plays, checked by the oracle (F1.9); without them, persona goals. */
  readonly tasks?: readonly TaskSpec[];
  readonly seeds: readonly number[];
  /** Caps every persona's patience in steps. */
  readonly maxSteps?: number;
  readonly budget: BudgetLimits;
  /** Sessions of this run playing at the same time. */
  readonly concurrency?: number;
}

const VARIANT_KEY = /^[a-z][a-z0-9]{0,3}$/;
const MAX_SESSIONS = 100;
const TASK_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

function unique(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

export function assertValidRunConfig(config: RunConfig): void {
  const fail = (reason: string) => new InvalidRunConfigError(`Invalid run config: ${reason}`);
  const { variants, personas, seeds, maxSteps, concurrency } = config;
  if (variants.length < 1 || variants.length > 4) throw fail('one to four variants');
  if (!variants.every((variant) => VARIANT_KEY.test(variant.key) && variant.ref !== '')) {
    throw fail(`variant keys must match ${VARIANT_KEY.source} and have a ref`);
  }
  if (!unique(variants.map((variant) => variant.key))) throw fail('variant keys repeat');
  if (
    variants.some((variant) => variant.repo !== undefined && !variant.repo.startsWith('file://'))
  ) {
    throw fail('a variant repo must be a local file:// clone');
  }
  if (personas.length > 10 || !unique(personas)) throw fail('at most ten different personas');
  const tasks = config.tasks ?? [];
  if (tasks.length > 10 || !unique(tasks.map((task) => task.id))) {
    throw fail('at most ten tasks with different ids');
  }
  for (const task of tasks) {
    if (!TASK_ID.test(task.id) || task.goal.trim() === '' || task.goal.length > 300) {
      throw fail(`task ${task.id} needs a slug id and a goal of up to 300 characters`);
    }
    if (
      task.expect.items.length === 0 ||
      !task.expect.items.every(
        (item) => Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10,
      )
    ) {
      throw fail(`task ${task.id} must expect one or more items with quantities from 1 to 10`);
    }
  }
  if (personas.includes(BASELINE_PERSONA)) {
    throw fail(`${BASELINE_PERSONA} is added to every variant; do not list it`);
  }
  if (
    seeds.length < 1 ||
    seeds.length > 20 ||
    !unique(seeds) ||
    !seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 9999)
  ) {
    throw fail('one to twenty different integer seeds from 0 to 9999');
  }
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 200)) {
    throw fail('maxSteps must be an integer from 1 to 200');
  }
  if (
    concurrency !== undefined &&
    (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10)
  ) {
    throw fail('concurrency must be an integer from 1 to 10');
  }
  const sessions =
    (personas.length + 1) * seeds.length * variants.length * Math.max(1, tasks.length);
  if (sessions > MAX_SESSIONS)
    throw fail(`${String(sessions)} sessions; at most ${String(MAX_SESSIONS)}`);
}
