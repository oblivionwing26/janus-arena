import { DomainError } from '../errors/domain-error.js';

export class InvalidPersonaError extends DomainError {
  readonly code = 'persona.invalid';

  constructor(
    readonly personaId: string,
    readonly reason: string,
  ) {
    super(`Persona ${personaId} is invalid: ${reason}`);
  }
}
