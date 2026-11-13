// The gate's last stages (F3.9): the signed dual report from every run the gate made, and the
// pull request that carries it. Both deterministic: no model is called.

import { relative } from 'node:path';

import type { GateStage, GateStageContext } from '../../domain/gate/gate-stage-port.js';
import type { ReportRunRole } from '../../domain/report/dual-report.js';
import {
  missingGitHubApp,
  openReportPullRequest,
  writeSignedReport,
} from '../report/signed-report.js';
import { outputOf, type GateDeps } from './gate-deps.js';

function listOf(context: GateStageContext, stage: 'blue-team', key: string): string[] {
  const value = context.outputs.get(stage)?.[key];
  return Array.isArray(value) ? value : [];
}

export function reportStage(deps: GateDeps): GateStage {
  return {
    name: 'report',
    async run(context) {
      const ux = outputOf(context, 'ab', 'runId') ?? outputOf(context, 'synthlab-a', 'runId');
      const runs: { role: ReportRunRole; runId: string | undefined }[] = [
        { role: 'ux', runId: ux },
        { role: 'audit', runId: outputOf(context, 'audit', 'runId') },
        { role: 'red-team', runId: outputOf(context, 'red-team', 'runId') },
        ...listOf(context, 'blue-team', 'runs').map((runId) => ({
          role: 'blue-team' as const,
          runId,
        })),
        ...listOf(context, 'blue-team', 'v3Runs').map((runId) => ({ role: 'v3' as const, runId })),
      ];
      const sha = outputOf(context, 'variant-b', 'sha');
      const dir = `${deps.root}docs/reports/gate-${context.gateRunId}`;
      const dual = await writeSignedReport(deps.store, {
        dir,
        target: deps.gate.target,
        runs: runs.flatMap(({ role, runId }) => (runId === undefined ? [] : [{ role, runId }])),
        commits: sha === undefined ? [] : [{ name: deps.gate.target, sha }],
      });
      return {
        status: 'completed',
        output: {
          dir: relative(deps.root, dir).replace(/\\/g, '/'),
          findings: dual.findings.length,
          fixes: dual.fixes.length,
          costEur: dual.cost.totalEur,
        },
      };
    },
  };
}

export function prStage(deps: GateDeps): GateStage {
  return {
    name: 'pr',
    async run(context) {
      if (!deps.gate.pr.open) {
        return { status: 'skipped', reason: deps.gate.pr.reason ?? 'disabled in the gate file' };
      }
      const branch = outputOf(context, 'variant-b', 'branch');
      const workspace = outputOf(context, 'variant-b', 'workspace');
      const dir = outputOf(context, 'report', 'dir');
      if (branch === undefined || workspace === undefined) {
        return { status: 'skipped', reason: 'no janus/variant branch to propose' };
      }
      if (dir === undefined) return { status: 'skipped', reason: 'no signed report to attach' };
      const missing = missingGitHubApp();
      if (missing.length > 0) {
        return {
          status: 'skipped',
          reason: `the GitHub App is not configured (${missing.join(', ')})`,
        };
      }
      const audit = context.outputs.get('audit');
      const opened = await openReportPullRequest(deps.store, {
        workspace,
        branch,
        reportDir: `${deps.root}${dir}`,
        title: `Janus gate: ${deps.gate.target} variant B${audit?.blocked === true ? ' (BLOCKED by the audit)' : ''}`,
      });
      return {
        status: 'completed',
        output: { url: opened.url, number: opened.number, existed: opened.existed },
      };
    },
  };
}
