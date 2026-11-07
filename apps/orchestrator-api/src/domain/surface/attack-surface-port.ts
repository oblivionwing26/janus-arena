import type { VcsWorkspace } from '../vcs/vcs-port.js';
import type { Endpoint } from './endpoint.js';

/**
 * The HTTP surface of a target, read from its code (F2.6). Every adapter must pass
 * src/test-support/attack-surface-contract.ts.
 */
export interface AttackSurfacePort {
  map(workspace: VcsWorkspace): Promise<Endpoint[]>;
}

export const ATTACK_SURFACE_PORT = Symbol('AttackSurfacePort');
