import { BASELINE_PERSONA, type RunConfig } from './run-config.js';
import type { SessionSpec } from './session-spec.js';

/**
 * The simulated address of the n-th slot (F4.1): its own (`distinct`, 10.20.x.y), or one of a few
 * shared by all of them (`shared`, 10.30.0.y: the same office or campus behind one NAT).
 */
export function clientAddress(
  clientIps: NonNullable<RunConfig['clientIps']>,
  slot: number,
): string {
  if (clientIps.mode === 'shared') return `10.30.0.${String((slot % clientIps.addresses) + 1)}`;
  return `10.20.${String(Math.floor(slot / 250))}.${String((slot % 250) + 1)}`;
}

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
  const clients = new Map<string, number>();
  const clientOf = (
    seed: number,
    task: string | undefined,
    persona: string,
  ): string | undefined => {
    if (config.clientIps === undefined) return undefined;
    const key = `${String(seed)}/${task ?? ''}/${persona}`;
    const slot = clients.get(key) ?? clients.size;
    clients.set(key, slot);
    return clientAddress(config.clientIps, slot);
  };
  const add = (slot: Omit<SessionSpec, 'sessionIndex' | 'task'>, task: string | undefined) => {
    const clientIp = clientOf(slot.seed, task, slot.persona ?? '');
    const full = clientIp === undefined ? slot : { ...slot, clientIp };
    slots.push(task === undefined ? full : { ...full, task });
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
