import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** .workspaces at the repository root (gitignored), from src or dist alike. */
export function workspacesRoot(): string {
  return fileURLToPath(new URL('../../../../../.workspaces/', import.meta.url));
}

function git(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      { windowsHide: true, timeout: 5 * 60_000 },
      (error, _out, stderr) => {
        if (error)
          reject(new Error(`git ${args[0] ?? ''} failed: ${stderr.trim() || error.message}`));
        else resolve();
      },
    );
  });
}

/**
 * A generated variant's clone (F2.4) may be built only from a file:// folder inside the
 * workspaces root: never another local path, and never something to fetch.
 */
export function assertLocalRepo(repo: string, root: string): string {
  let path: string;
  try {
    path = resolve(fileURLToPath(repo));
  } catch {
    throw new Error(`repo ${repo} is not a file:// URL`);
  }
  if (!path.startsWith(resolve(root) + sep)) {
    throw new Error(`repo ${repo} is outside the workspaces folder`);
  }
  return repo;
}

export interface WorkspaceRequest {
  readonly root: string;
  readonly variantId: string;
  readonly repo: string;
  /** Branch or tag (shallow clone). */
  readonly ref: string;
  /** Ground-truth files no agent may read; removed and checked after cloning. */
  readonly excludeFiles: readonly string[];
}

/** Fresh shallow clone of the target at `ref` in <root>/<variantId>, without excluded files. */
export async function prepareWorkspace(request: WorkspaceRequest): Promise<string> {
  if (request.ref.startsWith('-') || request.repo.startsWith('-')) {
    throw new Error('ref and repo must not start with "-"');
  }
  const dir = join(request.root, request.variantId);
  await mkdir(request.root, { recursive: true });
  await rm(dir, { recursive: true, force: true });
  await git(['clone', '--depth', '1', '--branch', request.ref, '--', request.repo, dir]);

  for (const file of request.excludeFiles) {
    await rm(join(dir, file), { force: true });
    if (existsSync(join(dir, file))) throw new Error(`Could not remove ${file} from ${dir}`);
  }
  return dir;
}

export async function removeWorkspace(root: string, variantId: string): Promise<void> {
  await rm(join(root, variantId), { recursive: true, force: true });
}
