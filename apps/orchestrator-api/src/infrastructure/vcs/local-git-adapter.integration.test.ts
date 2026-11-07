// F2.1 "Done when" (`pnpm test:integration`, needs network): clone the real ShopLab into
// .workspaces/<runId>/, apply a patch on janus/variant-<runId>, commit it and read the diff
// statistics. ShopLab's ground truth (UX_FLAWS.md) must stay out of the workspace and the diff.

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { loadSandboxDefinition } from '../sandbox/sandbox-definition.js';
import { workspacesRoot } from '../sandbox/workspace.js';
import { LocalGitAdapter } from './local-git-adapter.js';

const CART = 'src/app/cart/page.tsx';
const runId = newUlid();
const vcs = new LocalGitAdapter();
let workspace: VcsWorkspace;

/** A one-line replacement as a unified diff, with one line of context on each side. */
function replaceLine(path: string, content: string, find: string, replace: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.includes(find));
  if (index < 1) throw new Error(`${find} not found in ${path}`);
  const [before, target, after] = [lines[index - 1], lines[index], lines[index + 1]];
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${String(index)},3 +${String(index)},3 @@`,
    ` ${before ?? ''}`,
    `-${target ?? ''}`,
    `+${(target ?? '').replace(find, replace)}`,
    ` ${after ?? ''}`,
    '',
  ].join('\n');
}

beforeAll(async () => {
  const shoplab = await loadSandboxDefinition('shoplab');
  workspace = await vcs.clone(shoplab.repo, {
    runId,
    ref: 'main',
    excludeFiles: shoplab.excludeFiles,
  });
}, 120_000);

afterAll(async () => {
  await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
});

describe('LocalGitAdapter against ShopLab', () => {
  it('clones into .workspaces/<runId>/ without the ground truth', () => {
    expect(workspace.path).toBe(join(workspacesRoot(), runId));
    expect(existsSync(join(workspace.path, CART))).toBe(true);
    expect(existsSync(join(workspace.path, 'UX_FLAWS.md'))).toBe(false);
  });

  it('applies a patch on janus/variant-<runId>, commits it and measures the diff', async () => {
    const branch = JanusBranch.variant(runId);
    await vcs.branch(workspace, branch);
    const cart = await vcs.readFile(workspace, CART);

    await vcs.applyPatch(
      workspace,
      replaceLine(CART, cart, 'label="Otras opciones"', 'label="Añadir un cupón"'),
    );
    const sha = await vcs.commit(workspace, 'feat(cart): name the coupon link');

    expect(await vcs.head(workspace)).toEqual({ branch, sha });
    expect(await vcs.diffStats(workspace)).toEqual({
      files: [{ path: CART, added: 1, removed: 1 }],
      filesChanged: 1,
      added: 1,
      removed: 1,
    });
    expect(await vcs.readFile(workspace, CART)).toContain('label="Añadir un cupón"');
  });
});
