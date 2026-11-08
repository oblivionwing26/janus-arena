// Shared contract suite for VcsPort: the in-memory fake and LocalGitAdapter (over a throwaway
// file:// repository) both run it in `pnpm test`. Not part of the build.

import { describe, expect, it } from 'vitest';

import { JanusBranch } from '../domain/vcs/janus-branch.js';
import {
  FileNotInWorkspaceError,
  InvalidBranchNameError,
  InvalidRepoUrlError,
  PatchRejectedError,
  RefNotFoundError,
} from '../domain/vcs/vcs-errors.js';
import type { VcsPort } from '../domain/vcs/vcs-port.js';

export const CONTRACT_RUN = '01JC0F21VCS0000000000000AA';

/** The repository every harness serves on branch `main`. */
export const CONTRACT_FILES: Readonly<Record<string, string>> = {
  'README.md': 'ShopLab fixture\n',
  'src/app/cart/page.tsx': [
    'export default function Cart() {',
    '  return (',
    '    <main>',
    '      <h1>Carrito</h1>',
    '      <a href="#">Otras opciones</a>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'UX_FLAWS.md': '# Ground truth\n',
};

/** Renames the link: one line removed, one added. */
export const CONTRACT_PATCH = [
  'diff --git a/src/app/cart/page.tsx b/src/app/cart/page.tsx',
  '--- a/src/app/cart/page.tsx',
  '+++ b/src/app/cart/page.tsx',
  '@@ -3,5 +3,5 @@ export default function Cart() {',
  '     <main>',
  '       <h1>Carrito</h1>',
  '-      <a href="#">Otras opciones</a>',
  '+      <h2>¿Tienes un cupón?</h2>',
  '     </main>',
  '   );',
  '',
].join('\n');

const NEW_FILE_PATCH = [
  'diff --git a/src/components/coupon.tsx b/src/components/coupon.tsx',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/components/coupon.tsx',
  '@@ -0,0 +1,2 @@',
  '+export const Coupon = () => null;',
  '+export default Coupon;',
  '',
].join('\n');

const STALE_PATCH = CONTRACT_PATCH.replace('Otras opciones', 'Más opciones');

export interface VcsContractHarness {
  /** A fresh port and the URL of a repository holding CONTRACT_FILES on `main`. */
  readonly create: () => Promise<{ vcs: VcsPort; repoUrl: string }>;
}

export function describeVcsContract(name: string, harness: VcsContractHarness): void {
  // Real clones are slow when the machine is busy (turbo runs packages in parallel).
  describe(`VcsPort contract: ${name}`, { timeout: 20_000 }, () => {
    const cloned = async () => {
      const { vcs, repoUrl } = await harness.create();
      const workspace = await vcs.clone(repoUrl, {
        runId: CONTRACT_RUN,
        ref: 'main',
        excludeFiles: ['UX_FLAWS.md'],
      });
      return { vcs, workspace, repoUrl };
    };

    it('clones at the ref, with no changes and the ground truth hidden', async () => {
      const { vcs, workspace } = await cloned();

      expect(workspace.baseSha).toMatch(/^[0-9a-f]{40}$/);
      expect(workspace.url).toMatch(/^file:\/\/\/.+/);
      expect(await vcs.readFile(workspace, 'README.md')).toBe('ShopLab fixture\n');
      await expect(vcs.readFile(workspace, 'UX_FLAWS.md')).rejects.toThrow(FileNotInWorkspaceError);
      expect(await vcs.diffStats(workspace)).toEqual({
        files: [],
        filesChanged: 0,
        added: 0,
        removed: 0,
      });
      expect(await vcs.head(workspace)).toEqual({ branch: 'main', sha: workspace.baseSha });
    });

    it('lists the files of the working tree, new ones included and hidden ones never', async () => {
      const { vcs, workspace } = await cloned();

      expect(await vcs.listFiles(workspace)).toEqual(['README.md', 'src/app/cart/page.tsx']);
      await vcs.applyPatch(workspace, NEW_FILE_PATCH);
      expect(await vcs.listFiles(workspace)).toEqual([
        'README.md',
        'src/app/cart/page.tsx',
        'src/components/coupon.tsx',
      ]);
    });

    it('refuses repository URLs other than https:// and file://, and unknown refs', async () => {
      const { vcs, repoUrl } = await harness.create();

      await expect(
        vcs.clone('--upload-pack=x', { runId: CONTRACT_RUN, ref: 'main' }),
      ).rejects.toThrow(InvalidRepoUrlError);
      await expect(vcs.clone(repoUrl, { runId: CONTRACT_RUN, ref: 'nope' })).rejects.toThrow(
        RefNotFoundError,
      );
    });

    it('only creates janus/variant-<runId> and janus/fix-<findingId> branches', async () => {
      const { vcs, workspace } = await cloned();

      await expect(vcs.branch(workspace, 'main-2')).rejects.toThrow(InvalidBranchNameError);
      await vcs.branch(workspace, JanusBranch.variant(CONTRACT_RUN));

      expect((await vcs.head(workspace)).branch).toBe(`janus/variant-${CONTRACT_RUN}`);
    });

    it('applies a patch, measures it against the base and commits it on the branch', async () => {
      const { vcs, workspace } = await cloned();
      await vcs.branch(workspace, JanusBranch.variant(CONTRACT_RUN));

      await vcs.applyPatch(workspace, CONTRACT_PATCH);
      const before = await vcs.diffStats(workspace);
      const sha = await vcs.commit(workspace, 'feat: show the coupon field');

      const expected = {
        files: [{ path: 'src/app/cart/page.tsx', added: 1, removed: 1 }],
        filesChanged: 1,
        added: 1,
        removed: 1,
      };
      expect(before).toEqual(expected);
      expect(await vcs.diffStats(workspace)).toEqual(expected);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(sha).not.toBe(workspace.baseSha);
      expect(await vcs.head(workspace)).toEqual({ branch: `janus/variant-${CONTRACT_RUN}`, sha });
      expect(await vcs.readFile(workspace, 'src/app/cart/page.tsx')).toContain('¿Tienes un cupón?');
    });

    it('counts new files, and never commits the hidden ground truth as deleted', async () => {
      const { vcs, workspace } = await cloned();
      await vcs.branch(workspace, JanusBranch.variant(CONTRACT_RUN));

      await vcs.applyPatch(workspace, NEW_FILE_PATCH);
      await vcs.commit(workspace, 'feat: add a coupon component');

      expect(await vcs.diffStats(workspace)).toEqual({
        files: [{ path: 'src/components/coupon.tsx', added: 2, removed: 0 }],
        filesChanged: 1,
        added: 2,
        removed: 0,
      });
    });

    it('rejects a patch that does not apply, all or nothing', async () => {
      const { vcs, workspace } = await cloned();

      await expect(vcs.applyPatch(workspace, `${NEW_FILE_PATCH}${STALE_PATCH}`)).rejects.toThrow(
        PatchRejectedError,
      );
      await expect(vcs.readFile(workspace, 'src/components/coupon.tsx')).rejects.toThrow(
        FileNotInWorkspaceError,
      );
      expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
    });

    it('rejects patches outside the repository or on the hidden ground truth', async () => {
      const { vcs, workspace } = await cloned();
      const touching = (path: string) =>
        `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-# Ground truth\n+# Changed\n`;

      for (const path of ['../outside.md', '.git/config', 'UX_FLAWS.md']) {
        await expect(vcs.applyPatch(workspace, touching(path))).rejects.toThrow(PatchRejectedError);
      }
    });

    it('checks out a ref and refuses an unknown one', async () => {
      const { vcs, workspace } = await cloned();
      await vcs.branch(workspace, JanusBranch.fix(CONTRACT_RUN));
      await vcs.applyPatch(workspace, CONTRACT_PATCH);
      await vcs.commit(workspace, 'fix: change the link');

      await vcs.checkout(workspace, workspace.baseSha);

      expect(await vcs.head(workspace)).toEqual({ branch: null, sha: workspace.baseSha });
      expect(await vcs.readFile(workspace, 'src/app/cart/page.tsx')).toContain('Otras opciones');
      await expect(vcs.checkout(workspace, 'no-such-ref')).rejects.toThrow(RefNotFoundError);
    });
  });
}
