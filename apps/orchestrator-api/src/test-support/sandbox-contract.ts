// Shared contract suite for SandboxPort. The in-memory fake runs it in `pnpm test`;
// DockerSandbox runs it in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import { SandboxAlreadyUpError, SandboxNotFoundError } from '../domain/sandbox/sandbox-errors.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import { InvalidVariantError, type VariantSpec } from '../domain/sandbox/variant-spec.js';

export interface SandboxContractHarness {
  readonly sandbox: () => SandboxPort;
  /** A variant the adapter can really start. */
  readonly variant: (id: string) => VariantSpec;
  /** Generous for real adapters that build images. */
  readonly timeoutMs?: number;
}

export function describeSandboxContract(name: string, harness: SandboxContractHarness): void {
  const timeout = harness.timeoutMs ?? 5_000;

  describe(`SandboxPort contract: ${name}`, () => {
    it(
      'starts a variant, returns an http base URL, exposes logs and tears down',
      async () => {
        const sandbox = harness.sandbox();
        const variant = harness.variant('contract-a');
        try {
          const running = await sandbox.up(variant);

          expect(new URL(running.baseUrl).protocol).toBe('http:');
          expect(typeof (await sandbox.logs(variant.id))).toBe('string');
        } finally {
          await sandbox.down(variant.id);
        }
        await expect(sandbox.logs(variant.id)).rejects.toBeInstanceOf(SandboxNotFoundError);
      },
      timeout,
    );

    it(
      'refuses to start the same variant id twice',
      async () => {
        const sandbox = harness.sandbox();
        const variant = harness.variant('contract-b');
        try {
          await sandbox.up(variant);
          await expect(sandbox.up(variant)).rejects.toBeInstanceOf(SandboxAlreadyUpError);
        } finally {
          await sandbox.down(variant.id);
        }
      },
      timeout,
    );

    it('treats down of an unknown or stopped variant as a no-op', async () => {
      const sandbox = harness.sandbox();

      await expect(sandbox.down('never-started')).resolves.toBeUndefined();
      await expect(sandbox.down('never-started')).resolves.toBeUndefined();
    });

    it('rejects an invalid variant before doing anything', async () => {
      const sandbox = harness.sandbox();

      await expect(
        sandbox.up({ ...harness.variant('x'), id: 'Not A Slug' }),
      ).rejects.toBeInstanceOf(InvalidVariantError);
      await expect(
        sandbox.up({ ...harness.variant('x'), ref: '--upload-pack=x' }),
      ).rejects.toBeInstanceOf(InvalidVariantError);
    });
  });
}
