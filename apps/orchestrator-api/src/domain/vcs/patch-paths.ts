import { PatchRejectedError } from './vcs-errors.js';

const HEADER = /^(?:---|\+\+\+) (\S+)/;
const GIT_HEADER = /^diff --git a\/(\S+) b\/(\S+)$/;
const RENAME = /^(?:rename|copy) (?:from|to) (\S+)$/;

function relativePath(raw: string): string | null {
  if (raw === '/dev/null') return null;
  return raw.replace(/^[ab]\//, '');
}

/**
 * The files a unified diff touches, checked before anything is applied: every path must stay
 * inside the repository (no absolute paths, no `..`, no `.git/`). PatchRejectedError otherwise,
 * and for a text that is not a diff at all.
 */
export function patchPaths(diff: string): string[] {
  const paths = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const candidates: string[] = [];
    const git = GIT_HEADER.exec(line);
    if (git?.[1] !== undefined && git[2] !== undefined) candidates.push(git[1], git[2]);
    const header = HEADER.exec(line);
    if (header?.[1] !== undefined) {
      const path = relativePath(header[1]);
      if (path !== null) candidates.push(path);
    }
    const rename = RENAME.exec(line);
    if (rename?.[1] !== undefined) candidates.push(rename[1]);
    for (const path of candidates) {
      const segments = path.split(/[\\/]/);
      if (
        path.startsWith('/') ||
        /^[a-zA-Z]:/.test(path) ||
        segments.includes('..') ||
        segments[0] === '.git'
      ) {
        throw new PatchRejectedError(`path ${JSON.stringify(path)} is outside the repository`);
      }
      paths.add(path);
    }
  }
  if (paths.size === 0) throw new PatchRejectedError('no file headers; not a unified diff');
  return [...paths].sort();
}
