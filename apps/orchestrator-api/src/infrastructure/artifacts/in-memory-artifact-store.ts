import { ArtifactNotFoundError } from '../../domain/artifacts/artifact-errors.js';
import type { ArtifactStorePort } from '../../domain/artifacts/artifact-store-port.js';
import { assertArtifactKey } from '../../domain/artifacts/assert-artifact-key.js';

/** Fake artifact store for tests. */
export class InMemoryArtifactStore implements ArtifactStorePort {
  private readonly files = new Map<string, Uint8Array>();

  /** Keys stored for a run, for assertions. */
  keys(runId: string): string[] {
    return [...this.files.keys()]
      .filter((key) => key.startsWith(`${runId}/`))
      .map((key) => key.slice(runId.length + 1));
  }

  put(runId: string, key: string, bytes: Uint8Array): Promise<void> {
    try {
      assertArtifactKey(key);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.files.set(`${runId}/${key}`, new Uint8Array(bytes));
    return Promise.resolve();
  }

  get(runId: string, key: string): Promise<Uint8Array> {
    const bytes = this.files.get(`${runId}/${key}`);
    return bytes === undefined
      ? Promise.reject(new ArtifactNotFoundError(runId, key))
      : Promise.resolve(new Uint8Array(bytes));
  }
}
