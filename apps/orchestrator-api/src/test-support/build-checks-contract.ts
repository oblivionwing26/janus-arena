// Shared contract suite for BuildChecksPort: the scripted fake runs it in `pnpm test`, and
// DockerBuildChecks against a ShopLab clone in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import type { BuildChecksPort } from '../domain/checks/build-checks-port.js';
import type { VcsPort, VcsWorkspace } from '../domain/vcs/vcs-port.js';

export interface BuildChecksHarness {
  /** A port, the VCS of a fresh workspace of the target, and a patch that breaks its checks. */
  readonly create: () => Promise<{
    checks: BuildChecksPort;
    vcs: VcsPort;
    workspace: VcsWorkspace;
    breakingPatch: string;
  }>;
}

export function describeBuildChecksContract(
  name: string,
  harness: BuildChecksHarness,
  timeout = 5_000,
): void {
  describe(`BuildChecksPort contract: ${name}`, () => {
    it(
      'passes on the untouched target and fails, with its output, once a patch breaks it',
      async () => {
        const { checks, vcs, workspace, breakingPatch } = await harness.create();

        const clean = await checks.run(workspace);
        await vcs.applyPatch(workspace, breakingPatch);
        const broken = await checks.run(workspace);

        expect(clean.passed).toBe(true);
        expect(broken.passed).toBe(false);
        expect(broken.output).toMatch(/error/i);
        expect(broken.output.length).toBeLessThanOrEqual(8000);
      },
      timeout,
    );
  });
}
