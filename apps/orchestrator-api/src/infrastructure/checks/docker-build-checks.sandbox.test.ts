// F2.3-B, local only (`pnpm test:sandbox`, no API spend): ShopLab's own lint, typecheck and
// tests run on a clone in a container with no network, pass as cloned, and fail once a patch
// breaks the code. Needs `docker compose up -d` (socket proxy).

import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { newUlid } from '@janus/shared-kernel';
import { afterAll } from 'vitest';

import { describeBuildChecksContract } from '../../test-support/build-checks-contract.js';
import { DockerCli } from '../sandbox/docker-cli.js';
import { loadSandboxDefinition } from '../sandbox/sandbox-definition.js';
import { workspacesRoot } from '../sandbox/workspace.js';
import { LocalGitAdapter } from '../vcs/local-git-adapter.js';
import { DockerBuildChecks } from './docker-build-checks.js';

const runId = newUlid();

afterAll(async () => {
  await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
});

describeBuildChecksContract(
  'DockerBuildChecks on ShopLab',
  {
    create: async () => {
      const shoplab = await loadSandboxDefinition('shoplab');
      if (shoplab.checks === undefined) throw new Error('shoplab.yaml declares no checks');
      const vcs = new LocalGitAdapter();
      const workspace = await vcs.clone(shoplab.repo, {
        runId,
        ref: 'main',
        excludeFiles: shoplab.excludeFiles,
      });
      return {
        checks: new DockerBuildChecks(new DockerCli(), shoplab.checks),
        vcs,
        workspace,
        // A type error in a component: typecheck must catch it.
        breakingPatch: [
          'diff --git a/src/components/broken.tsx b/src/components/broken.tsx',
          'new file mode 100644',
          '--- /dev/null',
          '+++ b/src/components/broken.tsx',
          '@@ -0,0 +1 @@',
          '+export const broken: number = "not a number";',
          '',
        ].join('\n'),
      };
    },
  },
  30 * 60_000,
);
