import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ArtifactNotFoundError } from '../../domain/artifacts/artifact-errors.js';
import type { ArtifactStorePort } from '../../domain/artifacts/artifact-store-port.js';
import { assertArtifactKey } from '../../domain/artifacts/assert-artifact-key.js';

const RUN_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Artifacts as files under `<root>/<runId>/<key>` (the repository's .artifacts/ by default). */
export class FileArtifactStore implements ArtifactStorePort {
  constructor(private readonly root: string = repoArtifactsDir()) {}

  async put(runId: string, key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathOf(runId, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(runId: string, key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.pathOf(runId, key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ArtifactNotFoundError(runId, key);
      }
      throw error;
    }
  }

  private pathOf(runId: string, key: string): string {
    assertArtifactKey(key);
    if (!RUN_ID.test(runId)) throw new ArtifactNotFoundError(runId, key);
    return join(this.root, runId, ...key.split('/'));
  }
}

/** .artifacts/ at the repository root (gitignored), wherever this module runs from. */
export function repoArtifactsDir(): string {
  return fileURLToPath(new URL('../../../../../.artifacts/', import.meta.url));
}
