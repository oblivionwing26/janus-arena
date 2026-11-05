import { DomainError } from '../errors/domain-error.js';

export class DuplicateEventSeqError extends DomainError {
  readonly code = 'event-store.duplicate-seq';

  constructor(
    readonly runId: string,
    readonly seq: number | undefined,
  ) {
    super(
      seq === undefined
        ? `Duplicate seq in run ${runId}`
        : `Event seq ${String(seq)} already exists in run ${runId}`,
    );
  }
}
