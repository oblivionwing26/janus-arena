// F2.5, local only (`pnpm test:sandbox`, no API spend): the real tools through the socket
// proxy, each in a throwaway container, and the "Done when": Semgrep with Janus's own rules
// finds OWASP Juice Shop's DOM XSS and its negative-quantity price manipulation. Needs
// `docker compose up -d` and network (pulling images, cloning Juice Shop, osv.dev).

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { describeStaticAnalysisContract } from '../../test-support/static-analysis-contract.js';
import { DockerCli } from '../sandbox/docker-cli.js';
import { workspacesRoot } from '../sandbox/workspace.js';
import { LocalGitAdapter } from '../vcs/local-git-adapter.js';
import { DepcruiseAnalysis } from './depcruise-analysis.js';
import { GitleaksAnalysis } from './gitleaks-analysis.js';
import { OsvAnalysis } from './osv-analysis.js';
import { SemgrepAnalysis } from './semgrep-analysis.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const fixtures = `${root}apps/orchestrator-api/fixtures/static-analysis/`;
const rules = `${root}rules/semgrep`;
const sample = (name: string): VcsWorkspace => ({
  id: name,
  path: `${fixtures}${name}`,
  url: `file:///${name}`,
  baseSha: '',
});
const docker = new DockerCli();
const MINUTES = 60_000;

describeStaticAnalysisContract(
  'SemgrepAnalysis',
  {
    create: () =>
      Promise.resolve({
        analysis: new SemgrepAnalysis(docker, rules),
        workspace: sample('sample-repo'),
      }),
  },
  10 * MINUTES,
);
describeStaticAnalysisContract(
  'GitleaksAnalysis',
  {
    create: () =>
      Promise.resolve({ analysis: new GitleaksAnalysis(docker), workspace: sample('sample-repo') }),
    neverReported: ['q8Zr2XvT9mLw4KpB7nYc3HsD6fJu1GaE'],
  },
  10 * MINUTES,
);
describeStaticAnalysisContract(
  'OsvAnalysis',
  {
    create: () =>
      Promise.resolve({ analysis: new OsvAnalysis(docker), workspace: sample('sample-repo') }),
  },
  10 * MINUTES,
);
describeStaticAnalysisContract(
  'DepcruiseAnalysis',
  {
    create: () =>
      Promise.resolve({
        analysis: new DepcruiseAnalysis(`${root}config/arch/shoplab.depcruise.cjs`),
        workspace: sample('sample-arch'),
      }),
  },
  MINUTES,
);

describe('F2.5 done when: Semgrep finds the XSS and the price manipulation in Juice Shop', () => {
  const runId = newUlid();
  let findings: StaticFinding[] = [];

  beforeAll(async () => {
    const workspace = await new LocalGitAdapter().clone(
      'https://github.com/juice-shop/juice-shop.git',
      { runId, ref: 'v20.3.0', depth: 1 },
    );
    findings = await new SemgrepAnalysis(docker, rules).run(workspace);
    console.log(
      findings
        .map((finding) => `${finding.rule} ${finding.file}:${String(finding.line)}`)
        .join('\n'),
    );
  }, 30 * MINUTES);

  afterAll(async () => {
    await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
  });

  it('DOM XSS: the search term goes through bypassSecurityTrustHtml', () => {
    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'janus.angular-bypass-security-trust',
        file: 'frontend/src/app/search-result/search-result.component.ts',
        line: 146,
        severity: 'high',
      }),
    );
  });

  it('price manipulation: basket quantities are only checked against an upper bound', () => {
    const hits = findings.filter(
      (finding) =>
        finding.rule === 'janus.quantity-upper-bound-only' &&
        finding.file === 'routes/basketItems.ts',
    );
    expect(hits.map((finding) => finding.line)).toEqual(expect.arrayContaining([94, 95]));
    expect(hits[0]?.snippet).toContain('quantity');
  });
});
