import { DomainError } from '../errors/domain-error.js';

export class InvalidArtifactKeyError extends DomainError {
  readonly code = 'artifact.invalid-key';

  constructor(readonly key: string) {
    super(`Artifact key ${JSON.stringify(key)} is not a relative path inside the run`);
  }
}

export class ArtifactNotFoundError extends DomainError {
  readonly code = 'artifact.not-found';

  constructor(
    readonly runId: string,
    readonly key: string,
  ) {
    super(`No artifact ${key} in run ${runId}`);
  }
}
