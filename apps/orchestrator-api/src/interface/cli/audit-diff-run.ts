// `pnpm run:audit-diff <target> --a <ref> --b <ref> [--b-repo <file://clone>] [--osv]` (F2.7):
// the differential audit of a variant. Static analysis (Semgrep, gitleaks, dependency-cruiser,
// and osv-scanner with --osv, the one tool that needs the network) and the HTTP surface map on
// A and on B; prints what B introduces and the gate's verdict, and records them as a run.
// Exits 1 when B is blocked. No LLM is called.

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { newUlid } from '@janus/shared-kernel';

import { AuditVariantDiff } from '../../application/audit/audit-variant-diff.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import { DepcruiseAnalysis } from '../../infrastructure/analysis/depcruise-analysis.js';
import { GitleaksAnalysis } from '../../infrastructure/analysis/gitleaks-analysis.js';
import { OsvAnalysis } from '../../infrastructure/analysis/osv-analysis.js';
import { SemgrepAnalysis } from '../../infrastructure/analysis/semgrep-analysis.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import {
  loadSurfaceConfig,
  repoSurfaceConfigPath,
} from '../../infrastructure/surface/surface-config.js';
import { TypeScriptAttackSurface } from '../../infrastructure/surface/typescript-attack-surface.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const name = args[0];
const baseRef = option('a');
const variantRef = option('b');
if (
  name === undefined ||
  name.startsWith('--') ||
  baseRef === undefined ||
  variantRef === undefined
) {
  console.error(
    'Usage: pnpm run:audit-diff <target> --a <ref> --b <ref> [--b-repo <file://clone>] [--osv]',
  );
  process.exit(2);
}
const required = (variable: string) => {
  const value = process.env[variable];
  if (value === undefined || value === '')
    throw new Error(`${variable} is not set (see .env.example)`);
  return value;
};

const target = (await loadSurfaceConfig(repoSurfaceConfigPath()))[name];
if (target === undefined) throw new Error(`config/surface.yaml has no target ${name}`);
const definition = existsSync(`${root}docker/sandboxes/${name}.yaml`)
  ? await loadSandboxDefinition(name)
  : undefined;
const repo = target.repo ?? definition?.repo;
if (repo === undefined) throw new Error(`No repository for ${name}`);

const docker = new DockerCli(required('DOCKER_HOST'));
const tools: StaticAnalysisPort[] = [
  new SemgrepAnalysis(docker, `${root}rules/semgrep`),
  new GitleaksAnalysis(docker),
];
const archRules = `${root}config/arch/${name}.depcruise.cjs`;
if (existsSync(archRules)) tools.push(new DepcruiseAnalysis(archRules));
if (args.includes('--osv')) tools.push(new OsvAnalysis(docker));

const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const runId = newUlid();
let workspaces: readonly { readonly path: string }[] = [];
try {
  const variantRepo = option('b-repo');
  const result = await new AuditVariantDiff({
    vcs: new LocalGitAdapter(),
    tools,
    surface: new TypeScriptAttackSurface(target),
    store,
  }).execute({
    runId,
    repo,
    excludeFiles: definition?.excludeFiles ?? [],
    base: { ref: baseRef },
    variant: { ref: variantRef, ...(variantRepo === undefined ? {} : { repo: variantRepo }) },
  });
  workspaces = result.workspaces;
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.completed', {
    outcome: result.verdict.blocked ? 'error' : 'success',
    ...(result.verdict.blocked ? { reason: 'the differential audit blocks B' } : {}),
  });

  console.log(`Differential audit ${runId}: ${name} ${baseRef} → ${variantRef}`);
  console.log(`\nFindings B introduces (${String(result.findings.length)}):`);
  for (const finding of result.findings) {
    console.log(
      `  ${finding.severity.padEnd(8)} ${finding.tool} ${finding.rule} at ${finding.file}:${String(finding.line)}`,
    );
  }
  console.log(`\nEndpoint changes (${String(result.endpoints.length)}):`);
  for (const change of result.endpoints) {
    console.log(
      `  ${change.severity.padEnd(8)} ${change.endpoint.method} ${change.endpoint.route}: ${change.reason}`,
    );
  }
  console.log(`\nGate: ${result.verdict.blocked ? 'B IS BLOCKED' : 'B passes'}`);
  for (const reason of result.verdict.reasons) console.log(`  - ${reason}`);
  process.exitCode = result.verdict.blocked ? 1 : 0;
} finally {
  await store.close();
  // The audit's clones are throwaway.
  for (const workspace of workspaces) await rm(workspace.path, { recursive: true, force: true });
}
