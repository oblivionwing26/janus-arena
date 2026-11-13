// The gate's UX stages (F3.9): SynthLab on A, the UI Engineer's variant B, and the paired A/B.

import { execFileSync } from 'node:child_process';

import { GenerateAndCompareVariant } from '../../application/generate-and-compare-variant.js';
import type { GateStage } from '../../domain/gate/gate-stage-port.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { DockerBuildChecks } from '../../infrastructure/checks/docker-build-checks.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
} from '../../infrastructure/sandbox/sandbox-definition.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { limitsFor, outputOf, playOrResume, type GateDeps } from './gate-deps.js';

function variantA(deps: GateDeps) {
  const [a] = deps.config.variants;
  if (a === undefined) throw new Error(`${deps.gate.runFile} declares no variant A`);
  return { key: 'a', ref: a.ref, ...(a.base === undefined ? {} : { base: a.base }) };
}

export function synthlabAStage(deps: GateDeps): GateStage {
  return {
    name: 'synthlab-a',
    resumesRuns: true,
    async run(context) {
      const run = await playOrResume(
        deps,
        context,
        { ...deps.config, variants: [variantA(deps)] },
        'synthlab-a',
      );
      return { status: 'completed', output: { runId: run.runId } };
    },
  };
}

export function variantBStage(deps: GateDeps): GateStage {
  return {
    name: 'variant-b',
    async run(context) {
      const definition = await loadAnySandboxDefinition(deps.gate.target);
      if (
        isImageDefinition(definition) ||
        definition.uiEngineer === undefined ||
        definition.checks === undefined
      ) {
        return {
          status: 'skipped',
          reason: `${deps.gate.target} declares no UI Engineer policy and checks (docker/sandboxes/${deps.gate.target}.yaml)`,
        };
      }
      const discoveryRunId = outputOf(context, 'synthlab-a', 'runId');
      if (discoveryRunId === undefined)
        return { status: 'skipped', reason: 'no SynthLab run on A' };

      const generate = new GenerateAndCompareVariant({
        synthlab: deps.synthlab,
        gateway: deps.gateway,
        vcs: new LocalGitAdapter(),
        store: deps.store,
        checks: new DockerBuildChecks(deps.docker, definition.checks),
      });
      const { variantRunId, attempts, workspace, branch } = await generate.variant(
        {
          config: deps.config,
          target: {
            repo: definition.repo,
            excludeFiles: definition.excludeFiles,
            policy: new EditPolicy(definition.uiEngineer),
            allowed: definition.uiEngineer.allow,
          },
          report: deps.report,
          zones: deps.gate.variant.zones,
          engineerBudget: limitsFor('variant-b', context, 2_000_000),
          screenshot: (runId, artifact) =>
            new FileArtifactStore().get(runId, artifact).catch(() => undefined),
        },
        { runId: discoveryRunId, events: await deps.store.readRun(discoveryRunId) },
        { onRun: context.onRun },
      );
      if (branch === null) {
        return {
          status: 'skipped',
          reason: `the UI Engineer verified no patch in ${String(attempts.length)} zone(s) (run ${variantRunId})`,
        };
      }
      const sha = execFileSync('git', ['rev-parse', branch], { cwd: workspace.path })
        .toString()
        .trim();
      return {
        status: 'completed',
        output: {
          runId: variantRunId,
          branch,
          workspace: workspace.path,
          repo: workspace.url,
          sha,
        },
      };
    },
  };
}

export function abStage(deps: GateDeps): GateStage {
  return {
    name: 'ab',
    resumesRuns: true,
    async run(context) {
      const branch = outputOf(context, 'variant-b', 'branch');
      const repo = outputOf(context, 'variant-b', 'repo');
      if (branch === undefined || repo === undefined) {
        return { status: 'skipped', reason: 'no variant B to compare with A' };
      }
      const run = await playOrResume(
        deps,
        context,
        { ...deps.config, variants: [variantA(deps), { key: 'b', ref: branch, repo }] },
        'ab',
      );
      return { status: 'completed', output: { runId: run.runId } };
    },
  };
}
