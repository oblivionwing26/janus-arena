// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and access to GitHub (Juice
// Shop's source and its dependencies, the first time). F3.5 part A, ADR 0012.

import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SandboxStartError } from '../../domain/sandbox/sandbox-errors.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { LocalGitAdapter } from '../vcs/local-git-adapter.js';
import { DockerCli } from './docker-cli.js';
import { DockerSandbox, SANDBOX_NETWORK } from './docker-sandbox.js';
import { loadAnySandboxDefinition } from './sandbox-definition.js';
import { removeWorkspace, workspacesRoot } from './workspace.js';

const docker = new DockerCli();
const sandbox = new DockerSandbox({ docker, workspacesRoot: workspacesRoot() });
const vcs = new LocalGitAdapter();
const runId = newUlid();
let workspace: VcsWorkspace;

/** Juice Shop's version route, patched to say who built it. */
const VERSION_PATCH = [
  '--- a/routes/appVersion.ts',
  '+++ b/routes/appVersion.ts',
  "@@ -11,7 +11,7 @@ import * as utils from '../lib/utils'",
  ' export function retrieveAppVersion () {',
  '   return (_req: Request, res: Response) => {',
  '     res.json({',
  "-      version: config.get('application.showVersionNumber') ? utils.version() : ''",
  "+      version: 'janus-patched'",
  '     })',
  '   }',
  ' }',
  '',
].join('\n');

const FRONTEND_PATCH = [
  '--- a/frontend/src/main.ts',
  '+++ b/frontend/src/main.ts',
  '@@ -1 +1,2 @@',
  '+// changed',
  ' /*',
  '',
].join('\n');

// A throwaway container on janus-sbx, standing in for an agent's browser.
async function fetchFromSandbox(url: string): Promise<string> {
  const script = `fetch(${JSON.stringify(url)}).then((r) => r.text()).then(console.log)`;
  const { stdout } = await docker.run([
    'run',
    '--rm',
    '--network',
    SANDBOX_NETWORK,
    'node:24-alpine',
    'node',
    '-e',
    script,
  ]);
  return stdout.trim();
}

beforeAll(async () => {
  const definition = await loadAnySandboxDefinition('juice-shop');
  if (!('patch' in definition) || definition.patch === undefined) throw new Error('no patch');
  const { repo, ref, excludeFiles, stripComments } = definition.patch;
  workspace = await vcs.clone(repo, { runId, ref, depth: 1, excludeFiles, stripComments });
}, 10 * 60_000);

afterAll(async () => {
  await sandbox.down('patched');
  await sandbox.down('refused');
  await sandbox.down('broken');
  await removeWorkspace(workspacesRoot(), runId);
}, 60_000);

describe('F3.5 part A: a patched Juice Shop (ADR 0012)', () => {
  it('reaches the Blue Team without Juice Shop’s ground truth', async () => {
    const files = await vcs.listFiles(workspace);

    expect(files.filter((file) => file.startsWith('data/static/codefixes/'))).toEqual([]);
    expect(files).toContain('routes/basket.ts');
    for (const file of ['routes/basket.ts', 'routes/login.ts', 'routes/basketItems.ts']) {
      expect(await vcs.readFile(workspace, file)).not.toContain('vuln-code-snippet');
    }
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
  });

  it(
    'runs the published image with only the patched files recompiled',
    async () => {
      const branch = JanusBranch.fix(newUlid());
      await vcs.branch(workspace, branch);
      await vcs.applyPatch(workspace, VERSION_PATCH);
      await vcs.commit(workspace, 'fix: say who built this variant');

      const { baseUrl } = await sandbox.up({
        id: 'patched',
        target: 'juice-shop',
        ref: branch,
        repo: workspace.url,
        base: workspace.baseSha,
      });

      expect(await fetchFromSandbox(`${baseUrl}/rest/admin/application-version`)).toBe(
        '{"version":"janus-patched"}',
      );
      // Everything else is the published image: the shop still serves its products.
      expect(await fetchFromSandbox(`${baseUrl}/rest/products/search?q=Apple`)).toContain(
        'Apple Juice (1000ml)',
      );
    },
    15 * 60_000,
  );

  it(
    'reports the type errors of a patch that does not compile',
    async () => {
      const branch = JanusBranch.fix(newUlid());
      await vcs.checkout(workspace, workspace.baseSha);
      await vcs.branch(workspace, branch);
      await vcs.applyPatch(workspace, VERSION_PATCH.replace("'janus-patched'", 'notDefined'));
      await vcs.commit(workspace, 'fix: does not compile');

      await expect(
        sandbox.up({
          id: 'broken',
          target: 'juice-shop',
          ref: branch,
          repo: workspace.url,
          base: workspace.baseSha,
        }),
      ).rejects.toThrow(
        /does not compile:\nroutes\/appVersion\.ts\(\d+,\d+\): error TS\d+: Cannot find name 'notDefined'/,
      );
    },
    10 * 60_000,
  );

  it(
    'refuses to build a patch outside the backend sources',
    async () => {
      const branch = JanusBranch.fix(newUlid());
      await vcs.checkout(workspace, workspace.baseSha);
      await vcs.branch(workspace, branch);
      await vcs.applyPatch(workspace, FRONTEND_PATCH);
      await vcs.commit(workspace, 'fix: touch the frontend');

      await expect(
        sandbox.up({
          id: 'refused',
          target: 'juice-shop',
          ref: branch,
          repo: workspace.url,
          base: workspace.baseSha,
        }),
      ).rejects.toThrow(SandboxStartError);
    },
    5 * 60_000,
  );
});
