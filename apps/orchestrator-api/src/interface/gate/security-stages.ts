// The gate's security stages (F3.9): the differential audit of B, the Red Team on the target
// and the Blue Team on its confirmed findings. Wired like `pnpm run:audit-diff`,
// `pnpm run:red-team` and `pnpm run:blue-team`.

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import {
  isKnownEvent,
  newUlid,
  proofOfConceptSchema,
  RED_TEAM_CLASSES,
  type ProofOfConcept,
} from '@janus/shared-kernel';

import { AuditVariantDiff } from '../../application/audit/audit-variant-diff.js';
import {
  PocReplayVerifier,
  replayOnVariant,
} from '../../application/blue-team/poc-replay-verifier.js';
import { RegressionTestsVerifier } from '../../application/blue-team/regression-tests-verifier.js';
import { RemediateFinding } from '../../application/blue-team/remediate-finding.js';
import { SynthlabRerunVerifier } from '../../application/blue-team/synthlab-rerun-verifier.js';
import { pocKey, RunRedTeam } from '../../application/red-team/run-red-team.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { VerifyOwnership } from '../../application/scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { GateStage, GateStageContext } from '../../domain/gate/gate-stage-port.js';
import { Budget } from '../../domain/llm/budget.js';
import type { SynthLabPort } from '../../domain/run/synthlab-port.js';
import { chooseFindings } from '../../domain/gate/choose-findings.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { DepcruiseAnalysis } from '../../infrastructure/analysis/depcruise-analysis.js';
import { GitleaksAnalysis } from '../../infrastructure/analysis/gitleaks-analysis.js';
import { SemgrepAnalysis } from '../../infrastructure/analysis/semgrep-analysis.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { juiceShopRegressionTest } from '../../infrastructure/attack/juice-shop-regression-test.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { DockerTargetTests } from '../../infrastructure/checks/docker-target-tests.js';
import {
  loadVulnerabilityTests,
  repoVulnerabilityTestsPath,
} from '../../infrastructure/checks/vulnerability-tests-config.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
} from '../../infrastructure/sandbox/sandbox-definition.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import {
  loadScopeConfig,
  repoScopeConfigPath,
  scopePolicyFor,
} from '../../infrastructure/scope/scope-config.js';
import {
  loadSurfaceConfig,
  repoSurfaceConfigPath,
} from '../../infrastructure/surface/surface-config.js';
import { TypeScriptAttackSurface } from '../../infrastructure/surface/typescript-attack-surface.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { limitsFor, outputOf, type GateDeps } from './gate-deps.js';

/** Test types that attack the target, beyond browsing and probing it. */
const PASSIVE = new Set(['browse', 'http-probe']);

async function surfaceOf(target: string) {
  const surface = (await loadSurfaceConfig(repoSurfaceConfigPath()))[target];
  if (surface === undefined) throw new Error(`config/surface.yaml has no target ${target}`);
  return surface;
}

export function auditStage(deps: GateDeps): GateStage {
  return {
    name: 'audit',
    async run(context) {
      const branch = outputOf(context, 'variant-b', 'branch');
      const variantRepo = outputOf(context, 'variant-b', 'repo');
      if (branch === undefined || variantRepo === undefined) {
        return { status: 'skipped', reason: 'no variant B to audit against A' };
      }
      const { target } = deps.gate;
      const surface = await surfaceOf(target);
      const definition = await loadAnySandboxDefinition(target);
      const repo = surface.repo ?? (isImageDefinition(definition) ? undefined : definition.repo);
      if (repo === undefined) throw new Error(`No repository for ${target}`);
      const [a] = deps.config.variants;
      if (a === undefined) throw new Error(`${deps.gate.runFile} declares no variant A`);

      const tools: StaticAnalysisPort[] = [
        new SemgrepAnalysis(deps.docker, `${deps.root}rules/semgrep`),
        new GitleaksAnalysis(deps.docker),
      ];
      const archRules = `${deps.root}config/arch/${target}.depcruise.cjs`;
      if (existsSync(archRules)) tools.push(new DepcruiseAnalysis(archRules));

      const runId = newUlid();
      await context.onRun(runId);
      const result = await new AuditVariantDiff({
        vcs: new LocalGitAdapter(),
        tools,
        surface: new TypeScriptAttackSurface(surface),
        store: deps.store,
      }).execute({
        runId,
        repo,
        excludeFiles: isImageDefinition(definition) ? [] : definition.excludeFiles,
        base: { ref: a.ref },
        variant: { ref: branch, repo: variantRepo },
      });
      try {
        await new RunEventRecorder(deps.store, runId, ORCHESTRATOR_ACTOR, {
          startSeq: (await deps.store.readRun(runId)).length,
        }).record('run.completed', {
          outcome: result.verdict.blocked ? 'error' : 'success',
          ...(result.verdict.blocked ? { reason: 'the differential audit blocks B' } : {}),
        });
      } finally {
        for (const workspace of result.workspaces) {
          await rm(workspace.path, { recursive: true, force: true });
        }
      }
      return {
        status: 'completed',
        output: {
          runId,
          blocked: result.verdict.blocked,
          introduced: result.findings.length + result.endpoints.length,
        },
      };
    },
  };
}

export function redTeamStage(deps: GateDeps): GateStage {
  return {
    name: 'red-team',
    async run(context) {
      const { target } = deps.gate;
      const scopes = await loadScopeConfig(repoScopeConfigPath());
      const allowed = scopes[target]?.allowedTests ?? [];
      const offensive = allowed.filter((test) => !PASSIVE.has(test));
      if (offensive.length === 0) {
        return {
          status: 'skipped',
          reason: `the scope of ${target} allows only ${allowed.join(', ') || 'nothing'} (config/scopes.yaml, ADR 0006)`,
        };
      }
      const surface = await surfaceOf(target);
      if (surface.repo === undefined)
        throw new Error(`config/surface.yaml has no repo for ${target}`);
      const classes =
        deps.gate.redTeam.classes ??
        RED_TEAM_CLASSES.filter((each) => offensive.some((test) => test === each));

      const runId = newUlid();
      const variantId = `red-${runId.slice(-8).toLowerCase()}`;
      const orchestrator = new RunEventRecorder(deps.store, runId, ORCHESTRATOR_ACTOR);
      // The engine is deterministic (ADR 0011): the budget only bounds a model it never calls.
      const budget = { maxTokens: 2_000_000, maxEur: Math.max(context.allowanceEur, 0.01) };
      await orchestrator.record('run.started', { budget });
      await context.onRun(runId);
      let outcome: 'success' | 'error' = 'error';
      let reason = 'the Red Team run did not finish';
      try {
        const workspace = await new LocalGitAdapter().clone(surface.repo, {
          runId,
          ref: surface.ref ?? 'main',
          depth: 1,
        });
        const mapped = { ref: surface.ref ?? 'main', sha: workspace.baseSha };
        let endpoints;
        let findings;
        try {
          endpoints = await new TypeScriptAttackSurface(surface).map(workspace);
          findings = await new SemgrepAnalysis(deps.docker, `${deps.root}rules/semgrep`).run(
            workspace,
          );
        } finally {
          await rm(workspace.path, { recursive: true, force: true });
        }
        const { baseUrl } = await deps.sandbox.up({ id: variantId, target, ref: 'image' });
        const origin = new URL(baseUrl).origin;
        const scope = await new VerifyOwnership({
          tokens: deps.sandbox,
          http: deps.http,
          store: deps.store,
        }).execute({ runId, variantId, policy: scopePolicyFor(scopes, target, [origin]) });
        const result = await new RunRedTeam({
          gateway: deps.gateway,
          store: deps.store,
          http: deps.http,
          target: (client, at) => ({
            users: new JuiceShopTestUsers(client, at),
            victim: new JuiceShopVictimData(client, at),
            businessLogic: new JuiceShopBusinessLogic(client, at),
          }),
          browser: deps.browser,
          artifacts: new FileArtifactStore(),
        }).execute({
          runId,
          scope,
          origin,
          classes,
          endpoints,
          surface: mapped,
          findings,
          engine: 'deterministic',
          budget: new Budget(budget),
        });
        outcome = 'success';
        reason = '';
        return {
          status: 'completed',
          output: {
            runId,
            confirmed: [...result.confirmed],
            unconfirmed: result.unconfirmed.length,
          },
        };
      } catch (error) {
        reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
        throw error;
      } finally {
        await orchestrator.record('run.completed', {
          outcome,
          ...(reason === '' ? {} : { reason }),
        });
        await deps.sandbox.down(variantId);
      }
    },
  };
}

/** SynthLab for V3, telling the gate about every run it starts so their cost counts. */
function reportingRuns(synthlab: SynthLabPort, context: GateStageContext, runs: string[]) {
  return {
    runAndWait: (config, options) =>
      synthlab.runAndWait(config, {
        ...options,
        onStarted: async (runId) => {
          runs.push(runId);
          await context.onRun(runId);
          await options?.onStarted?.(runId);
        },
      }),
    waitFor: (runId, options) => synthlab.waitFor(runId, options),
  } satisfies SynthLabPort;
}

export function blueTeamStage(deps: GateDeps): GateStage {
  return {
    name: 'blue-team',
    async run(context) {
      const redRunId = outputOf(context, 'red-team', 'runId');
      const confirmed = context.outputs.get('red-team')?.confirmed;
      if (redRunId === undefined || !Array.isArray(confirmed) || confirmed.length === 0) {
        return { status: 'skipped', reason: 'no finding confirmed by the Red Team' };
      }
      const { target } = deps.gate;
      const definition = await loadAnySandboxDefinition(target);
      if (!isImageDefinition(definition) || definition.patch === undefined) {
        return {
          status: 'skipped',
          reason: `docker/sandboxes/${target}.yaml declares no patch section for the Blue Team`,
        };
      }
      const { patch } = definition;

      // Their PoCs, then the most severe ones V2 can verify, as many as the gate file allows.
      const pocs = new Map<string, ProofOfConcept>();
      for (const findingId of confirmed) {
        const bytes = await new FileArtifactStore().get(redRunId, pocKey(findingId));
        pocs.set(
          findingId,
          proofOfConceptSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))),
        );
      }
      const severity = new Map(
        (await deps.store.readRun(redRunId))
          .filter(isKnownEvent)
          .flatMap((event) =>
            event.type === 'finding.created'
              ? [[event.payload.findingId, event.payload.severity] as const]
              : [],
          ),
      );
      const { chosen, unverifiable } = chooseFindings(
        [...pocs].map(([findingId, poc]) => ({
          findingId,
          severity: severity.get(findingId),
          verifiable: juiceShopRegressionTest(poc, findingId) !== null,
        })),
        deps.gate.blueTeam.maxFixes,
      );
      if (chosen.length === 0) {
        return {
          status: 'skipped',
          reason: `no confirmed finding V2 can verify: no regression test can be generated from ${unverifiable.map((id) => pocs.get(id)?.steps.kind ?? id).join(', ')} PoCs yet`,
        };
      }
      const share = limitsFor('blue-team', context).maxEur / chosen.length;

      const surface = await surfaceOf(target);
      const scopes = await loadScopeConfig(repoScopeConfigPath());
      const vulnerable = await loadVulnerabilityTests(repoVulnerabilityTestsPath());
      const blueRuns: string[] = [];
      const v3Runs: string[] = [];
      const fixed: string[] = [];
      const branches: string[] = [];
      for (const findingId of chosen) {
        const poc = pocs.get(findingId);
        if (poc === undefined) continue;
        const runId = newUlid();
        // The Blue Team's model gets a third of the share; V3's SynthLab runs the rest.
        const budget = { maxTokens: 2_000_000, maxEur: share / 3 };
        const recorder = new RunEventRecorder(deps.store, runId, ORCHESTRATOR_ACTOR);
        await recorder.record('run.started', { budget });
        await context.onRun(runId);
        blueRuns.push(runId);

        const vcs = new LocalGitAdapter();
        const workspace = await vcs.clone(patch.repo, {
          runId,
          ref: patch.ref,
          depth: 1,
          excludeFiles: patch.excludeFiles,
          stripComments: patch.stripComments,
        });
        const endpoints = await new TypeScriptAttackSurface(surface).map(workspace);
        const endpoint =
          endpoints.find((each) => `${each.method} ${each.route}` === poc.endpoint) ?? null;
        const v2 = new RegressionTestsVerifier({
          tests: new DockerTargetTests({ docker: deps.docker, workspacesRoot: workspacesRoot() }),
          generate: juiceShopRegressionTest,
          vulnerable,
        });
        const v1 = new PocReplayVerifier({
          replay: replayOnVariant({
            store: deps.store,
            http: deps.http,
            tokens: deps.sandbox,
            browser: deps.browser,
            target: (client, at) => ({
              users: new JuiceShopTestUsers(client, at),
              victim: new JuiceShopVictimData(client, at),
              businessLogic: new JuiceShopBusinessLogic(client, at),
            }),
            policyFor: (name, origin) => scopePolicyFor(scopes, name, [origin]),
          }),
        });
        const v3Budget = Math.min(deps.config.budget.maxEur, (share * 2) / 3);
        const v3 = new SynthlabRerunVerifier({
          synthlab: reportingRuns(deps.synthlab, context, v3Runs),
          config: { ...deps.config, budget: { ...deps.config.budget, maxEur: v3Budget } },
          report: deps.report,
          touched: (files) =>
            endpoints.filter(
              (each) =>
                files.includes(each.declaredAt.file) ||
                (each.handler !== null && files.includes(each.handler.file)),
            ),
        });
        const result = await new RemediateFinding({
          gateway: deps.gateway,
          vcs,
          store: deps.store,
          sandbox: deps.sandbox,
          verifiers: [v1, v2, v3],
          regressionTest: (fix) => v2.regressionTest(fix),
        }).execute({
          runId,
          findingId,
          target,
          poc,
          endpoint,
          workspace,
          policy: new EditPolicy(patch.blueTeam),
          allowed: patch.blueTeam.allow,
          budget: new Budget(budget),
        });
        await recorder.record('run.completed', {
          outcome: result.status === 'fixed' ? 'success' : 'error',
          ...(result.status === 'fixed' ? {} : { reason: result.reason }),
        });
        if (result.status === 'fixed') {
          fixed.push(findingId);
          branches.push(`janus/fix-${findingId}`);
        }
      }
      return {
        status: 'completed',
        output: { runs: blueRuns, v3Runs, fixed, branches, unverifiable: [...unverifiable] },
      };
    },
  };
}
