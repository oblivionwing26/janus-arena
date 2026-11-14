import { DomainError } from '../errors/domain-error.js';

/** What a saboteur does to a target (F4.1, ADR 0020): load it, or guess at an account. */
export type SaboteurTask = 'saturation' | 'brute-force';

/**
 * Where a target takes the traffic of each task. Only ShopLab has one: it is the only target
 * Janus loads.
 */
export interface SaboteurTarget {
  /** A cheap anonymous request that every API route's limit counts. */
  readonly saturate: { readonly method: 'POST'; readonly path: string };
  readonly register: { readonly path: string; readonly address: string };
  readonly login: { readonly path: string };
}

export const SABOTEUR_TARGETS: Readonly<Record<string, SaboteurTarget>> = {
  shoplab: {
    saturate: { method: 'POST', path: '/api/auth/logout' },
    register: { path: '/api/auth/register', address: 'Calle Saboteadora 1, 28001 Madrid' },
    login: { path: '/api/auth/login' },
  },
};

export class NoSaboteurPlanError extends DomainError {
  readonly code = 'saboteur.no-plan';

  constructor(target: string) {
    super(`Janus has no way to load or guess at "${target}": saboteurs only run on ShopLab`);
  }
}

export function saboteurTarget(target: string): SaboteurTarget {
  const found = SABOTEUR_TARGETS[target];
  if (found === undefined) throw new NoSaboteurPlanError(target);
  return found;
}

/** Requests of a saturation stream: enough to cross any limit a run sets, quick to send. */
export const SATURATION_REQUESTS = 40;
/** Wrong passwords tried at one account before the right one. */
export const WRONG_GUESSES = 8;

/** The saboteurs take turns: the first loads the shop, the second guesses, and so on. */
export function taskOf(saboteurIndex: number): SaboteurTask {
  return saboteurIndex % 2 === 0 ? 'saturation' : 'brute-force';
}

/** The wait between two requests that keeps a pace, given how long the last one took. */
export function waitMs(requestsPerSecond: number, tookMs: number): number {
  return Math.max(0, Math.round(1000 / requestsPerSecond - tookMs));
}
