import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { clipSnippet } from '../../domain/analysis/static-finding.js';

/** Where every analysis container sees the workspace. */
export const CONTAINER_ROOT = '/src';

/** A path the tool printed, relative to the repository root with forward slashes. */
export function repoPath(toolPath: string): string {
  const path = toolPath.replace(/\\/g, '/');
  return path.startsWith(`${CONTAINER_ROOT}/`) ? path.slice(CONTAINER_ROOT.length + 1) : path;
}

/**
 * Lines `start`..`end` (1-based) of a workspace file, clipped to the snippet limit. Tools such as
 * Semgrep OSS do not print the code, so snippets come from the workspace itself.
 */
export async function readSnippet(
  root: string,
  file: string,
  start: number,
  end = start,
): Promise<string> {
  if (start < 1 || file.split('/').includes('..')) return '';
  try {
    const lines = (await readFile(join(root, ...file.split('/')), 'utf8')).split(/\r?\n/);
    return clipSnippet(lines.slice(start - 1, Math.max(start, end)).join('\n'));
  } catch {
    return '';
  }
}
