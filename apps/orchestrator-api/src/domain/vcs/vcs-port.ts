/** A clone of a target repository that Janus may change (F2.1). */
export interface VcsWorkspace {
  readonly id: string;
  /** Local folder of the clone; outside the Janus repository. */
  readonly path: string;
  /** The clone as a file:// URL, for a sandbox to build a variant from it (F2.4). */
  readonly url: string;
  /** The commit the clone started from: diffs and limits are measured against it. */
  readonly baseSha: string;
}

export interface CloneOptions {
  /** The run the workspace belongs to (a ULID). */
  readonly runId: string;
  /** Branch, tag or commit to start from. */
  readonly ref: string;
  /** Ground-truth files no agent may read (e.g. ShopLab's UX_FLAWS.md): hidden, never committed. */
  readonly excludeFiles?: readonly string[];
}

export interface FileDiffStat {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}

/** What changed since the base commit, committed or not. */
export interface DiffStats {
  readonly files: readonly FileDiffStat[];
  readonly filesChanged: number;
  readonly added: number;
  readonly removed: number;
}

/**
 * Version control over a cloned target (F2.1): the UI Engineer and the Blue Team change code only
 * through it, on `janus/variant-<runId>` or `janus/fix-<findingId>` branches. Every adapter
 * must pass src/test-support/vcs-contract.ts.
 */
export interface VcsPort {
  /** InvalidRepoUrlError unless https:// or file://; RefNotFoundError for an unknown ref. */
  clone(repoUrl: string, options: CloneOptions): Promise<VcsWorkspace>;
  /** Creates the branch at HEAD and switches to it; InvalidBranchNameError off convention. */
  branch(workspace: VcsWorkspace, name: string): Promise<void>;
  /** RefNotFoundError for an unknown ref. */
  checkout(workspace: VcsWorkspace, ref: string): Promise<void>;
  /** Applies a unified diff to the working tree, all or nothing; PatchRejectedError otherwise. */
  applyPatch(workspace: VcsWorkspace, diff: string): Promise<void>;
  /** Commits every change of the working tree; returns the new commit's sha. */
  commit(workspace: VcsWorkspace, message: string): Promise<string>;
  diffStats(workspace: VcsWorkspace): Promise<DiffStats>;
  /** The current branch (null when detached) and commit. */
  head(workspace: VcsWorkspace): Promise<{ branch: string | null; sha: string }>;
  /** Every file of the working tree, tracked or new, sorted; hidden files never appear (F2.2). */
  listFiles(workspace: VcsWorkspace): Promise<string[]>;
  /** A file of the working tree; FileNotInWorkspaceError when absent or hidden. */
  readFile(workspace: VcsWorkspace, path: string): Promise<string>;
}

export const VCS_PORT = Symbol('VcsPort');
