import type { EditPolicy } from '../../domain/vcs/edit-policy.js';

// The Dockerfile receives these as one space-separated build argument.
const SOURCE = /^[\w./-]+\.ts$/;

/**
 * The sources a patched image variant recompiles (ADR 0012), from `git diff --name-status -z`
 * between the patch's base and its head. The sandbox does not trust the branch it is given: a
 * deleted file, a file that is not TypeScript or one outside the target's patch policy cannot
 * be built, since only the compiled files of changed sources replace the image's.
 */
export function patchedSources(nameStatus: string, policy: EditPolicy): string[] {
  const fields = nameStatus.split('\0').filter((field) => field !== '');
  const sources: string[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const kind = fields[index] ?? '';
    const path = fields[index + 1] ?? '';
    // The regression test a fix keeps (F3.5, V2) runs in the tests stage, never in the image.
    if (kind === 'A' && /^test\/[\w./-]+\.ts$/.test(path)) continue;
    if (!(kind === 'A' || kind === 'M') || !SOURCE.test(path) || !policy.canEdit(path)) {
      throw new Error(`The patch cannot be built: ${kind} ${path}`);
    }
    sources.push(path);
  }
  return sources.sort();
}
