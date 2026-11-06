/**
 * Files a run produces besides events, such as screenshots (F1.6). Keys are relative to the
 * run (`carmen-retired-0/step-12.png`). Every adapter must pass
 * src/test-support/artifact-store-contract.ts.
 */
export interface ArtifactStorePort {
  /** Stores the bytes; InvalidArtifactKeyError for a key outside the run. */
  put(runId: string, key: string, bytes: Uint8Array): Promise<void>;
  /** ArtifactNotFoundError when nothing was stored under that key. */
  get(runId: string, key: string): Promise<Uint8Array>;
}

export const ARTIFACT_STORE_PORT = Symbol('ArtifactStorePort');
