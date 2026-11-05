import { DomainError } from '../errors/domain-error.js';

export class LlmRefusalError extends DomainError {
  readonly code = 'llm.refusal';

  constructor(
    readonly model: string,
    readonly category: string | null,
  ) {
    super(`${model} declined the request${category === null ? '' : ` (${category})`}`);
  }
}
