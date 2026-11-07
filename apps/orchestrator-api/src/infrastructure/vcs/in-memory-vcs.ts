import { createHash } from 'node:crypto';

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

type Files = Readonly<Record<string, string>>;

interface State {
  readonly commits: Map<string, Files>;
  readonly branches: Map<string, string>;
  branch: string | null;
  sha: string;
  tree: Record<string, string>;
  readonly hidden: ReadonlySet<string>;
}

const lines = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

/** Lines added and removed between two texts (longest common subsequence). */
function lineDiff(before: string, after: string): { added: number; removed: number } {
  const a = lines(before);
  const b = lines(after);
  const common: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = common[i] ?? [];
      row[j] =
        a[i] === b[j]
          ? (common[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(common[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const kept = common[0]?.[0] ?? 0;
  return { added: b.length - kept, removed: a.length - kept };
}

/** Applies a unified diff to a set of files; PatchRejectedError when a hunk does not match. */
function applyUnifiedDiff(files: Files, diff: string): Record<string, string> {
  const result: Record<string, string> = { ...files };
  const text = diff.split('\n');
  let index = 0;
  while (index < text.length) {
    const from = /^--- (\S+)/.exec(text[index] ?? '');
    const to = /^\+\+\+ (\S+)/.exec(text[index + 1] ?? '');
    if (from?.[1] === undefined || to?.[1] === undefined) {
      index += 1;
      continue;
    }
    const oldPath = from[1] === '/dev/null' ? null : from[1].replace(/^a\//, '');
    const newPath = to[1] === '/dev/null' ? null : to[1].replace(/^b\//, '');
    index += 2;
    if (oldPath !== null && result[oldPath] === undefined) {
      throw new PatchRejectedError(`${oldPath} does not exist`);
    }
    if (oldPath === null && newPath !== null && result[newPath] !== undefined) {
      throw new PatchRejectedError(`${newPath} already exists`);
    }
    const source = oldPath === null ? [] : lines(result[oldPath] ?? '');
    const output: string[] = [];
    let cursor = 0;
    for (let hunk = /^@@ -(\d+)/.exec(text[index] ?? ''); hunk !== null;) {
      const start = Math.max(0, Number(hunk[1]) - 1);
      output.push(...source.slice(cursor, start));
      cursor = start;
      index += 1;
      for (; index < text.length; index++) {
        const line = text[index] ?? '';
        if (line.startsWith('@@') || line.startsWith('--- ') || line.startsWith('diff ')) break;
        const body = line.slice(1);
        if (line.startsWith('+')) output.push(body);
        else if (line.startsWith('-') || line.startsWith(' ')) {
          if (source[cursor] !== body)
            throw new PatchRejectedError(`hunk does not match ${oldPath ?? ''}`);
          if (line.startsWith(' ')) output.push(body);
          cursor += 1;
        }
      }
      hunk = /^@@ -(\d+)/.exec(text[index] ?? '');
    }
    output.push(...source.slice(cursor));
    if (oldPath !== null) Reflect.deleteProperty(result, oldPath);
    if (newPath !== null) result[newPath] = output.length === 0 ? '' : `${output.join('\n')}\n`;
  }
  return result;
}

/** Fake VcsPort for tests: repositories are maps of files per branch. */
export class InMemoryVcs implements VcsPort {
  private readonly workspaces = new Map<string, State>();

  /** `repos[url][branch]` = the files on that branch. */
  constructor(private readonly repos: Readonly<Record<string, Readonly<Record<string, Files>>>>) {}

  clone(repoUrl: string, options: CloneOptions): Promise<VcsWorkspace> {
    return this.run(() => {
      assertRepoUrl(repoUrl);
      const branches = this.repos[repoUrl];
      if (branches === undefined) throw new VcsCommandError(`no repository at ${repoUrl}`);
      const files = branches[options.ref];
      if (files === undefined) throw new RefNotFoundError(options.ref);
      const commits = new Map<string, Files>();
      const refs = new Map<string, string>();
      for (const [name, content] of Object.entries(branches)) {
        const sha = this.shaOf(`${repoUrl}#${name}`, content);
        commits.set(sha, content);
        refs.set(name, sha);
      }
      const sha = refs.get(options.ref) ?? '';
      const hidden = new Set(options.excludeFiles ?? []);
      const state: State = {
        commits,
        branches: refs,
        branch: options.ref,
        sha,
        tree: this.visible(files, hidden),
        hidden,
      };
      this.workspaces.set(options.runId, state);
      return { id: options.runId, path: `memory://${options.runId}`, baseSha: sha };
    });
  }

  branch(workspace: VcsWorkspace, name: string): Promise<void> {
    return this.run(() => {
      JanusBranch.assert(name);
      const state = this.state(workspace);
      if (state.branches.has(name)) throw new VcsCommandError(`branch ${name} exists`);
      state.branches.set(name, state.sha);
      state.branch = name;
    });
  }

  checkout(workspace: VcsWorkspace, ref: string): Promise<void> {
    return this.run(() => {
      const state = this.state(workspace);
      const branchSha = state.branches.get(ref);
      const sha = branchSha ?? (state.commits.has(ref) ? ref : undefined);
      const files = sha === undefined ? undefined : state.commits.get(sha);
      if (sha === undefined || files === undefined) throw new RefNotFoundError(ref);
      state.sha = sha;
      state.branch = branchSha === undefined ? null : ref;
      state.tree = this.visible(files, state.hidden);
    });
  }

  applyPatch(workspace: VcsWorkspace, diff: string): Promise<void> {
    return this.run(() => {
      const state = this.state(workspace);
      for (const path of patchPaths(diff)) {
        if (state.hidden.has(path)) throw new PatchRejectedError(`${path} is not in the workspace`);
      }
      state.tree = applyUnifiedDiff(state.tree, diff);
    });
  }

  commit(workspace: VcsWorkspace, message: string): Promise<string> {
    return this.run(() => {
      const state = this.state(workspace);
      const previous = state.commits.get(state.sha) ?? {};
      const files: Record<string, string> = { ...state.tree };
      for (const path of state.hidden) {
        const kept = previous[path];
        if (kept !== undefined) files[path] = kept;
      }
      const sha = this.shaOf(`${state.sha}\n${message}`, files);
      state.commits.set(sha, files);
      state.sha = sha;
      if (state.branch !== null) state.branches.set(state.branch, sha);
      return sha;
    });
  }

  diffStats(workspace: VcsWorkspace): Promise<DiffStats> {
    return this.run(() => {
      const state = this.state(workspace);
      const base = this.visible(state.commits.get(workspace.baseSha) ?? {}, state.hidden);
      const paths = [...new Set([...Object.keys(base), ...Object.keys(state.tree)])].sort();
      const files = paths.flatMap((path) => {
        const { added, removed } = lineDiff(base[path] ?? '', state.tree[path] ?? '');
        return added === 0 && removed === 0 ? [] : [{ path, added, removed }];
      });
      return {
        files,
        filesChanged: files.length,
        added: files.reduce((sum, file) => sum + file.added, 0),
        removed: files.reduce((sum, file) => sum + file.removed, 0),
      };
    });
  }

  head(workspace: VcsWorkspace): Promise<{ branch: string | null; sha: string }> {
    return this.run(() => {
      const state = this.state(workspace);
      return { branch: state.branch, sha: state.sha };
    });
  }

  readFile(workspace: VcsWorkspace, path: string): Promise<string> {
    return this.run(() => {
      const content = this.state(workspace).tree[path];
      if (content === undefined) throw new FileNotInWorkspaceError(path);
      return content;
    });
  }

  private state(workspace: VcsWorkspace): State {
    const state = this.workspaces.get(workspace.id);
    if (state === undefined) throw new VcsCommandError(`no workspace ${workspace.id}`);
    return state;
  }

  private visible(files: Files, hidden: ReadonlySet<string>): Record<string, string> {
    return Object.fromEntries(Object.entries(files).filter(([path]) => !hidden.has(path)));
  }

  private shaOf(seed: string, files: Files): string {
    return createHash('sha1')
      .update(seed)
      .update(JSON.stringify(Object.entries(files).sort()))
      .digest('hex');
  }

  private run<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
