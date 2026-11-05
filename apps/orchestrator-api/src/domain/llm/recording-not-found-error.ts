import { DomainError } from '../errors/domain-error.js';

export class RecordingNotFoundError extends DomainError {
  readonly code = 'llm.recording-not-found';

  constructor(
    readonly role: string,
    readonly requestHash: string,
  ) {
    super(`No recorded LLM response for role ${role} and request ${requestHash}`);
  }
}
