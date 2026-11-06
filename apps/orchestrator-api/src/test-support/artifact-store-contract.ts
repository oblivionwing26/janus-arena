// Shared contract suite for ArtifactStorePort: the in-memory fake and the file store both run it
// in `pnpm test`. Not part of the build.

import { describe, expect, it } from 'vitest';

import {
  ArtifactNotFoundError,
  InvalidArtifactKeyError,
} from '../domain/artifacts/artifact-errors.js';
import type { ArtifactStorePort } from '../domain/artifacts/artifact-store-port.js';

const RUN = '01JC0F16ART0000000000000AA';
const OTHER_RUN = '01JC0F16ART0000000000000AB';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

export function describeArtifactStoreContract(
  name: string,
  store: () => Promise<ArtifactStorePort>,
): void {
  describe(`ArtifactStorePort contract: ${name}`, () => {
    it('gives back exactly the bytes stored under a key', async () => {
      const artifacts = await store();
      await artifacts.put(RUN, 'carmen-retired-0/step-3.png', PNG);

      expect(await artifacts.get(RUN, 'carmen-retired-0/step-3.png')).toEqual(PNG);
    });

    it('keeps runs apart and fails clearly for a missing artifact', async () => {
      const artifacts = await store();
      await artifacts.put(RUN, 'a/step-0.png', PNG);

      await expect(artifacts.get(OTHER_RUN, 'a/step-0.png')).rejects.toBeInstanceOf(
        ArtifactNotFoundError,
      );
    });

    it.each(['../escape.png', '/abs/step.png', 'a/../../b.png', 'Upper/step.png', ''])(
      'rejects the key %j',
      async (key) => {
        const artifacts = await store();
        await expect(artifacts.put(RUN, key, PNG)).rejects.toBeInstanceOf(InvalidArtifactKeyError);
      },
    );
  });
}
