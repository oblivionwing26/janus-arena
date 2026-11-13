// `pnpm run:benchmark juice-shop [--runs 3]` (F3.11): the public benchmark. A control round on a
// fresh Juice Shop (nobody attacks it), then `--runs` rounds, each on its own fresh instance, with
// the Red Team's deterministic engine and every class. Juice Shop's own count of solved challenges
// is the score; the report is docs/reports/benchmark-<target>.md with its .json. Calls no model.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { newUlid } from '@janus/shared-kernel';

import { RunBenchmark } from '../../application/benchmark/run-benchmark.js';
import { SemgrepAnalysis } from '../../infrastructure/analysis/semgrep-analysis.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import {
  loadBenchmarkSpec,
  repoBenchmarksPath,
} from '../../infrastructure/benchmark/benchmark-config.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
} from '../../infrastructure/sandbox/sandbox-definition.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
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
import { benchmarkJson, formatBenchmark } from '../benchmark/format-benchmark.js';
import { JuiceShopBenchmarkRounds } from '../benchmark/juice-shop-rounds.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const target = args[0];
const runs = Number(option('runs') ?? '3');
if (target !== 'juice-shop' || !Number.isInteger(runs) || runs < 1 || runs > 10) {
  console.error(
    'Usage: pnpm run:benchmark juice-shop [--runs 3]  (only Juice Shop has a benchmark)',
  );
  process.exit(2);
}
const required = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

const spec = await loadBenchmarkSpec(repoBenchmarksPath(), target);
const definition = await loadAnySandboxDefinition(target);
if (!isImageDefinition(definition)) throw new Error(`docker/sandboxes/${target}.yaml is no image`);
const surfaceTarget = (await loadSurfaceConfig(repoSurfaceConfigPath()))[target];
if (surfaceTarget?.repo === undefined)
  throw new Error(`config/surface.yaml has no repo for ${target}`);
const scopes = await loadScopeConfig(repoScopeConfigPath());

const docker = new DockerCli(required('DOCKER_HOST'));
const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const sandbox = new DockerSandbox({ docker, workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
try {
  // What the engine works from, read once from a throwaway clone: it is the same in every round.
  const workspace = await new LocalGitAdapter().clone(surfaceTarget.repo, {
    runId: newUlid(),
    ref: surfaceTarget.ref ?? 'main',
    depth: 1,
  });
  let endpoints;
  let leads;
  try {
    endpoints = await new TypeScriptAttackSurface(surfaceTarget).map(workspace);
    leads = await new SemgrepAnalysis(docker, `${root}rules/semgrep`).run(workspace);
  } finally {
    await rm(workspace.path, { recursive: true, force: true });
  }
  console.log(
    `Benchmark of ${target}: ${String(endpoints.length)} endpoints, ${String(leads.length)} static leads, ${String(runs)} attack rounds`,
  );

  const outcome = await new RunBenchmark({
    rounds: new JuiceShopBenchmarkRounds({
      store,
      sandbox,
      http,
      browser,
      target,
      endpoints,
      leads,
      surface: { ref: surfaceTarget.ref ?? 'main', sha: workspace.baseSha },
      policyFor: (origin) => scopePolicyFor(scopes, target, [origin]),
      onProgress: (message) => {
        console.log(`  ${message}`);
      },
    }),
  }).execute({
    spec,
    runs,
    onProgress: (message) => {
      console.log(message);
    },
  });

  const meta = {
    command: `pnpm run:benchmark ${target} --runs ${String(runs)}`,
    target,
    image: definition.image,
    janusCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    generatedAt: new Date().toISOString(),
  };
  await mkdir(`${root}docs/reports`, { recursive: true });
  await writeFile(
    `${root}docs/reports/benchmark-${target}.md`,
    formatBenchmark(meta, spec, outcome),
  );
  await writeFile(
    `${root}docs/reports/benchmark-${target}.json`,
    `${JSON.stringify(benchmarkJson(meta, spec, outcome), null, 2)}\n`,
  );

  const n = outcome.score.inScope;
  console.log(`\nRecall on ${String(n)} challenges in scope:`);
  outcome.score.rounds.forEach((round, index) => {
    console.log(
      `  round ${String(index + 1)}: ${String(round.solved)}/${String(n)} (reference ${String(round.referenceSolved)}/${String(round.referenceTotal)}), ${String(Math.round((outcome.rounds[index]?.durationMs ?? 0) / 1000))} s`,
    );
  });
  console.log(`Report: docs/reports/benchmark-${target}.md`);
} finally {
  await browser.close();
  await http.close();
  await store.close();
}
