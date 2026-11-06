import { DomainError } from '../errors/domain-error.js';

export class PersonaNotFoundError extends DomainError {
  readonly code = 'persona.not-found';

  constructor(readonly personaId: string) {
    super(`No persona ${personaId}`);
  }
}
