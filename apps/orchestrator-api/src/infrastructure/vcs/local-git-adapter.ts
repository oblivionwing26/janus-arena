import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';

import { assertRepoUrl } from '../../domain/vcs/assert-repo-url.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import { patchPaths } from '../../domain/vcs/patch-paths.js';
import {
  FileNotInWorkspaceError,
  PatchRejectedError,
  RefNotFoundError,
  VcsCommandError,
} from '../../domain/vcs/vcs-errors.js';
import type { CloneOptions, DiffStats, VcsPort, VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { workspacesRoot } from '../sandbox/workspace.js';

const RUN_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
// Janus's own identity, for this workspace's commits only; the user's git config is untouched.
const IDENTITY = ['-c', 'user.name=Janus', '-c', 'user.email=janus@localhost'];

class GitFailure extends Error {
  constructor(
    readonly args: readonly string[],
    readonly stderr: string,
  ) {
    super(`git ${args[0] ?? ''} failed: ${stderr.trim()}`);
  }
}

function git(
  args: readonly string[],
  options: { cwd?: string; input?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...args], {
      cwd: options.cwd,
      windowsHide: true,
      timeout: 5 * 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new GitFailure(args, stderr || `exit code ${String(code)}`));
    });
    child.stdin.end(options.input ?? '');
  });
}

function assertRef(ref: string): string {
  if (ref === '' || ref.startsWith('-') || /[\s~^:?*[\\]/.test(ref)) {
    throw new RefNotFoundError(ref);
  }
  return ref;
}

/**
 * VcsPort over the `git` binary (F2.1). Each run's clone lives in `.workspaces/<runId>/`,
 * outside the Janus repository. URLs, refs, branch names and patch paths are checked before
 * git sees them; ground-truth files are marked skip-worktree and deleted, so no agent reads
 * them and no commit records their removal.
 */
export class LocalGitAdapter implements VcsPort {
  private readonly hidden = new Map<string, ReadonlySet<string>>();

  constructor(private readonly root: string = workspacesRoot()) {}

  async clone(repoUrl: string, options: CloneOptions): Promise<VcsWorkspace> {
    assertRepoUrl(repoUrl);
    if (!RUN_ID.test(options.runId))
      throw new VcsCommandError(`run id ${options.runId} is not a ULID`);
    const ref = assertRef(options.ref);
    const dir = join(this.root, options.runId);
    await mkdir(this.root, { recursive: true });
    await rm(dir, { recursive: true, force: true });
    try {
      // Line endings stay as committed, so patches written against the repository apply.
      await git(['clone', '--quiet', '-c', 'core.autocrlf=false', '--', repoUrl, dir]);
    } catch (error) {
      throw this.translate(error);
    }
    try {
      // A branch (local or remote) is checked out as a branch; a tag or commit, detached.
      await git(['switch', '--quiet', ref], { cwd: dir }).catch(() =>
        git(['checkout', '--quiet', '--detach', ref], { cwd: dir }),
      );
    } catch {
      await rm(dir, { recursive: true, force: true });
      throw new RefNotFoundError(ref);
    }

    const hidden = new Set<string>();
    for (const file of options.excludeFiles ?? []) {
      const path = this.relative(dir, file);
      const tracked = await git(['ls-files', '--', path], { cwd: dir });
      if (tracked.trim() !== '') {
        await git(['update-index', '--skip-worktree', '--', path], { cwd: dir });
      }
      await rm(join(dir, path), { force: true });
      hidden.add(path);
    }
    this.hidden.set(options.runId, hidden);
    const baseSha = (await git(['rev-parse', 'HEAD'], { cwd: dir })).trim();
    return { id: options.runId, path: dir, baseSha };
  }

  async branch(workspace: VcsWorkspace, name: string): Promise<void> {
    JanusBranch.assert(name);
    await this.git(workspace, ['switch', '--quiet', '-c', name]);
  }

  async checkout(workspace: VcsWorkspace, ref: string): Promise<void> {
    assertRef(ref);
    try {
      await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: workspace.path });
    } catch {
      throw new RefNotFoundError(ref);
    }
    await this.git(workspace, ['checkout', '--quiet', ref, '--']);
  }

  async applyPatch(workspace: VcsWorkspace, diff: string): Promise<void> {
    const hidden = this.hidden.get(workspace.id) ?? new Set<string>();
    for (const path of patchPaths(diff)) {
      if (hidden.has(path)) throw new PatchRejectedError(`${path} is not in the workspace`);
    }
    const patch = diff.endsWith('\n') ? diff : `${diff}\n`;
    try {
      // --check first: git apply is atomic per call, but checking keeps the tree untouched on
      // any doubt.
      await git(['apply', '--check', '--whitespace=nowarn', '-'], {
        cwd: workspace.path,
        input: patch,
      });
      await git(['apply', '--whitespace=nowarn', '-'], { cwd: workspace.path, input: patch });
    } catch (error) {
      throw new PatchRejectedError(
        error instanceof GitFailure ? error.stderr.trim() : String(error),
      );
    }
  }

  async commit(workspace: VcsWorkspace, message: string): Promise<string> {
    await this.git(workspace, ['add', '--all']);
    await this.git(workspace, [...IDENTITY, 'commit', '--quiet', '--message', message]);
    return (await this.git(workspace, ['rev-parse', 'HEAD'])).trim();
  }

  async diffStats(workspace: VcsWorkspace): Promise<DiffStats> {
    // Staging is harmless and makes new files count; skip-worktree files are never staged.
    await this.git(workspace, ['add', '--all']);
    const numstat = await this.git(workspace, [
      'diff',
      '--cached',
      '--numstat',
      '--no-renames',
      workspace.baseSha,
      '--',
    ]);
    const files = numstat
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [added = '0', removed = '0', ...path] = line.split('\t');
        // Binary files show "-": they count as changed with no lines.
        return {
          path: path.join('\t'),
          added: added === '-' ? 0 : Number(added),
          removed: removed === '-' ? 0 : Number(removed),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    return {
      files,
      filesChanged: files.length,
      added: files.reduce((sum, file) => sum + file.added, 0),
      removed: files.reduce((sum, file) => sum + file.removed, 0),
    };
  }

  async head(workspace: VcsWorkspace): Promise<{ branch: string | null; sha: string }> {
    const sha = (await this.git(workspace, ['rev-parse', 'HEAD'])).trim();
    try {
      const branch = await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], {
        cwd: workspace.path,
      });
      return { branch: branch.trim(), sha };
    } catch {
      return { branch: null, sha };
    }
  }

  async readFile(workspace: VcsWorkspace, path: string): Promise<string> {
    const relative = this.relative(workspace.path, path);
    if (this.hidden.get(workspace.id)?.has(relative) === true) {
      throw new FileNotInWorkspaceError(path);
    }
    try {
      return await readFile(join(workspace.path, relative), 'utf8');
    } catch {
      throw new FileNotInWorkspaceError(path);
    }
  }

  /** A path inside the workspace, with forward slashes; FileNotInWorkspaceError otherwise. */
  private relative(dir: string, path: string): string {
    const clean = normalize(path);
    if (isAbsolute(clean) || clean.startsWith('..') || clean.split(sep)[0] === '.git') {
      throw new FileNotInWorkspaceError(path);
    }
    if (!join(dir, clean).startsWith(dir)) throw new FileNotInWorkspaceError(path);
    return clean.split(sep).join('/');
  }

  private async git(workspace: VcsWorkspace, args: readonly string[]): Promise<string> {
    try {
      return await git(args, { cwd: workspace.path });
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): VcsCommandError {
    return new VcsCommandError(error instanceof Error ? error.message : String(error));
  }
}
