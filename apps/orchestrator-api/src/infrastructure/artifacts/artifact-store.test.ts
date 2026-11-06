import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describeArtifactStoreContract } from '../../test-support/artifact-store-contract.js';
import { FileArtifactStore } from './file-artifact-store.js';
import { InMemoryArtifactStore } from './in-memory-artifact-store.js';

describeArtifactStoreContract('InMemoryArtifactStore', () =>
  Promise.resolve(new InMemoryArtifactStore()),
);
describeArtifactStoreContract('FileArtifactStore', async () => {
  return new FileArtifactStore(await mkdtemp(join(tmpdir(), 'janus-artifacts-')));
});
