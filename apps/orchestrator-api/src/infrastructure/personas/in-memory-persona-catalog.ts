import { PersonaNotFoundError } from '../../domain/persona/persona-not-found-error.js';
import type { PersonaCatalogPort } from '../../domain/persona/persona-catalog-port.js';
import { Persona, type PersonaProps } from '../../domain/persona/persona.js';

/** Fake catalog for tests: personas given in code. */
export class InMemoryPersonaCatalog implements PersonaCatalogPort {
  private readonly personas: readonly Persona[];

  constructor(personas: readonly PersonaProps[]) {
    this.personas = personas
      .map((props) => Persona.create(props))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  list(): Promise<Persona[]> {
    return Promise.resolve([...this.personas]);
  }

  get(id: string): Promise<Persona> {
    const persona = this.personas.find((candidate) => candidate.id === id);
    return persona === undefined
      ? Promise.reject(new PersonaNotFoundError(id))
      : Promise.resolve(persona);
  }
}
