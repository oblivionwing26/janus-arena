import { DomainError } from '../errors/domain-error.js';

export class InvalidRepoUrlError extends DomainError {
  readonly code = 'vcs.invalid-repo-url';

  constructor(readonly repoUrl: string) {
    super(`Repository URL ${JSON.stringify(repoUrl)} must be https:// or file://`);
  }
}

export class InvalidBranchNameError extends DomainError {
  readonly code = 'vcs.invalid-branch-name';

  constructor(readonly branch: string) {
    super(`Branch ${JSON.stringify(branch)} is not janus/variant-<runId> or janus/fix-<findingId>`);
  }
}

export class RefNotFoundError extends DomainError {
  readonly code = 'vcs.ref-not-found';

  constructor(readonly ref: string) {
    super(`No branch, tag or commit ${JSON.stringify(ref)}`);
  }
}

export class PatchRejectedError extends DomainError {
  readonly code = 'vcs.patch-rejected';

  constructor(detail: string) {
    super(`Patch rejected: ${detail}`);
  }
}

export class FileNotInWorkspaceError extends DomainError {
  readonly code = 'vcs.file-not-found';

  constructor(readonly path: string) {
    super(`No file ${JSON.stringify(path)} in the workspace`);
  }
}

export class VcsCommandError extends DomainError {
  readonly code = 'vcs.command-failed';

  constructor(detail: string) {
    super(`Version control failed: ${detail}`);
  }
}
