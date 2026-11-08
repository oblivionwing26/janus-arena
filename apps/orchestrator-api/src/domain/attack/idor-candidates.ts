import type { Endpoint } from '../surface/endpoint.js';
import type { AttackRequest } from './attack-request.js';

export interface IdorConfig {
  /** The attacker's own object id (its basket id, say): the base for the ids it probes. */
  readonly baseId: number;
  /** How many ids up and down to try around the base (±1…±neighbours). */
  readonly neighbours: number;
}

export const DEFAULT_IDOR_CONFIG: Omit<IdorConfig, 'baseId'> = { neighbours: 3 };

const PARAM = /^:[A-Za-z][\w-]*$/;

/** The single `:param` segment of a route, or null when it has none or several. */
function soleParam(route: string): { index: number; segments: string[] } | null {
  const segments = route.split('/');
  const indices = segments.flatMap((segment, index) => (PARAM.test(segment) ? [index] : []));
  return indices.length === 1 && indices[0] !== undefined ? { index: indices[0], segments } : null;
}

/** The ids to probe: the attacker's own, then its neighbours, nearest first; all ≥ 1. */
function probeIds(baseId: number, neighbours: number): number[] {
  const ids = [baseId];
  for (let distance = 1; distance <= neighbours; distance++) {
    ids.push(baseId + distance, baseId - distance);
  }
  return [...new Set(ids)].filter((id) => id >= 1);
}

/**
 * IDOR candidates (F3.3): for every endpoint that needs a session, does not filter by the owner
 * (owner check `false` or `unknown`) and takes a single id in its path, request that id as B for
 * the attacker's own id and its neighbours. Ids are consecutive, as a real IDOR relies on; the
 * canary-leak oracle decides which response actually leaked another user's object. Reads only
 * (GET): nothing is created or changed. Derived entirely from the surface map, no target
 * specifics.
 */
export function idorCandidates(
  endpoints: readonly Endpoint[],
  config: IdorConfig,
): AttackRequest[] {
  const ids = probeIds(config.baseId, config.neighbours);
  const candidates: AttackRequest[] = [];
  for (const endpoint of endpoints) {
    if (endpoint.method !== 'GET' || !endpoint.auth || endpoint.ownerCheck === true) continue;
    const param = soleParam(endpoint.route);
    if (param === null) continue;
    for (const id of ids) {
      const segments = [...param.segments];
      segments[param.index] = String(id);
      candidates.push({ class: 'idor', as: 'b', method: 'GET', path: segments.join('/') });
    }
  }
  return candidates;
}
