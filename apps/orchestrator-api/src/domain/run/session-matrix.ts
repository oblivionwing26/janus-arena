import { BASELINE_PERSONA, type RunConfig } from './run-config.js';
import type { SessionSpec } from './session-spec.js';

/**
 * Every session of a run, paired by design (F1.7): each persona, task and seed plays every
 * variant, one after the other, and each variant gets the competent baseline for every task and
 * seed. Without tasks, the slots play the personas' own goals (F1.9).
 */
export function sessionMatrix(config: RunConfig): SessionSpec[] {
  const tasks: (string | undefined)[] =
    config.tasks === undefined || config.tasks.length === 0
      ? [undefined]
      : config.tasks.map((task) => task.id);
  const slots: Omit<SessionSpec, 'sessionIndex'>[] = [];
  const add = (slot: Omit<SessionSpec, 'sessionIndex' | 'task'>, task: string | undefined) => {
    slots.push(task === undefined ? slot : { ...slot, task });
  };
  for (const seed of config.seeds) {
    for (const task of tasks) {
      for (const persona of config.personas) {
        for (const { key } of config.variants) {
          add({ variant: key, kind: 'persona', persona, seed }, task);
        }
      }
    }
  }
  for (const seed of config.seeds) {
    for (const task of tasks) {
      for (const { key } of config.variants) {
        add({ variant: key, kind: 'baseline', persona: BASELINE_PERSONA, seed }, task);
      }
    }
  }
  return slots.map((slot, sessionIndex) => ({ sessionIndex, ...slot }));
}
