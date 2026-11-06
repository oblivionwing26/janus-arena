import type { Persona } from './persona.js';

/**
 * The personas available to SynthLab. Every adapter must pass
 * src/test-support/persona-catalog-contract.ts.
 */
export interface PersonaCatalogPort {
  /** Every persona, sorted by id. */
  list(): Promise<Persona[]>;
  /** Throws PersonaNotFoundError when there is no persona with that id. */
  get(id: string): Promise<Persona>;
}

export const PERSONA_CATALOG_PORT = Symbol('PersonaCatalogPort');
