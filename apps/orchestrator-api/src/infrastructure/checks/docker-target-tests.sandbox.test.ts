// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and GitHub. F3.5, V2 on the
// real Juice Shop: its own tests plus the regression test of the basket IDOR, on the base and on
// the fix the Blue Team wrote in run 01M77K7NZ0SPGZJG269NMER302. No LLM.

import type { ProofOfConcept } from '@janus/shared-kernel';
import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { judgeTests, type TestResults } from '../../domain/fix/judge-tests.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { juiceShopRegressionTest } from '../attack/juice-shop-regression-test.js';
import { DockerCli } from '../sandbox/docker-cli.js';
import { loadAnySandboxDefinition } from '../sandbox/sandbox-definition.js';
import { removeWorkspace, workspacesRoot } from '../sandbox/workspace.js';
import { LocalGitAdapter } from '../vcs/local-git-adapter.js';
import { DockerTargetTests } from './docker-target-tests.js';
import {
  loadVulnerabilityTests,
  repoVulnerabilityTestsPath,
} from './vulnerability-tests-config.js';

const IDOR: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};

/** The Blue Team's fix of the basket IDOR (F3.5 part A), as it proposed it. */
const FIX = [
  'diff --git a/routes/basket.ts b/routes/basket.ts',
  '--- a/routes/basket.ts',
  '+++ b/routes/basket.ts',
  '@@ -17,6 +17,11 @@',
  '     try {',
  '       const id = req.params.id',
  "       const basket = await BasketModel.findOne({ where: { id }, include: [{ model: ProductModel, paranoid: false, as: 'Products' }] })",
  '+      const loggedInUser = security.authenticatedUsers.from(req)',
  '+      if (basket != null && (loggedInUser?.data?.id == null || basket.UserId !== loggedInUser.data.id)) {',
  "+        res.status(403).json({ error: 'Forbidden' })",
  '+        return',
  '+      }',
  '       /* jshint eqeqeq:false */',
  '       challengeUtils.solveIf(challenges.basketAccessChallenge, () => {',
  '         const user = security.authenticatedUsers.from(req)',
  '',
].join('\n');

const vcs = new LocalGitAdapter();
const tests = new DockerTargetTests({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const runId = newUlid();
const findingId = newUlid();
let workspace: VcsWorkspace;
let head: string;

beforeAll(async () => {
  const definition = await loadAnySandboxDefinition('juice-shop');
  if (!('patch' in definition) || definition.patch === undefined) throw new Error('no patch');
  const { repo, ref, excludeFiles, stripComments } = definition.patch;
  workspace = await vcs.clone(repo, { runId, ref, depth: 1, excludeFiles, stripComments });
  await vcs.branch(workspace, JanusBranch.fix(findingId));
  await vcs.applyPatch(workspace, FIX);
  head = await vcs.commit(workspace, 'fix: baskets are read by their owner');
}, 10 * 60_000);

afterAll(async () => {
  await removeWorkspace(workspacesRoot(), runId);
});

describe('F3.5, V2 on Juice Shop: its tests and the regression test, base against fix', () => {
  it(
    'fails the regression test on the base, passes it on the fix, and breaks only listed tests',
    async () => {
      const regression = juiceShopRegressionTest(IDOR, findingId);
      if (regression === null) throw new Error('no regression test');
      const run = (commit: string): Promise<TestResults> =>
        tests.run({ target: 'juice-shop', repo: workspace.url, commit, extra: [regression] });

      const base = await run(workspace.baseSha);
      const patch = await run(head);

      expect(base.size).toBeGreaterThan(900);
      expect(base.get(regression.name)).toBe('fail');
      expect(patch.get(regression.name)).toBe('pass');
      const vulnerable = (await loadVulnerabilityTests(repoVulnerabilityTestsPath()))(
        'juice-shop',
        IDOR.endpoint,
      );
      const verdict = judgeTests({ base, patch, regression: regression.name, vulnerable });
      expect(verdict.details).not.toContain('fail on the fix');
      expect(verdict.passed).toBe(true);
    },
    30 * 60_000,
  );
});
