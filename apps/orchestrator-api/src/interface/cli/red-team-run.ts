// `pnpm run:red-team <target> [--classes idor,auth-bypass,xss,business-logic] [--engine deterministic|agent] [--keep]` (F3.3): reads
// the target's HTTP surface and static leads from a throwaway clone, starts it in the sandbox,
// verifies ownership, and lets the Red Team probe it through the guard. Every attempt, oracle
// verdict and finding is recorded as a run. Calls the Anthropic API (role red-team).

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { newUlid, RED_TEAM_CLASSES, redTeamClassSchema } from '@janus/shared-kernel';

import { LlmEventObserver } from '../../application/llm-event-observer.js';
import { RunRedTeam } from '../../application/red-team/run-red-team.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { VerifyOwnership } from '../../application/scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { Budget } from '../../domain/llm/budget.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { SemgrepAnalysis } from '../../infrastructure/analysis/semgrep-analysis.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from '../../infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
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

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const name = args[0];
const maxEur = Number(option('max-eur') ?? '0.4');
const classes = (option('classes') ?? RED_TEAM_CLASSES.join(','))
  .split(',')
  .map((each) => redTeamClassSchema.parse(each.trim()));
// The deterministic engine is the default; `--engine agent` is declined by the provider (ADR 0011).
const engine = option('engine') === 'agent' ? 'agent' : 'deterministic';
if (name === undefined || name.startsWith('--') || !(maxEur > 0)) {
  console.error(
    'Usage: pnpm run:red-team <target> [--classes idor,auth-bypass,xss,business-logic] [--engine deterministic|agent] [--max-eur 0.4] [--keep]',
  );
  process.exit(2);
}
const required = (variable: string) => {
  const value = process.env[variable];
  if (value === undefined || value === '')
    throw new Error(`${variable} is not set (see .env.example)`);
  return value;
};

const surfaceTarget = (await loadSurfaceConfig(repoSurfaceConfigPath()))[name];
if (surfaceTarget?.repo === undefined)
  throw new Error(`config/surface.yaml has no repo for ${name}`);
const docker = new DockerCli(required('DOCKER_HOST'));
const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const gateway = new AnthropicGateway(
  new RecordedLLMAdapter({
    mode: 'record',
    dir: `${root}recordings/live/`,
    inner: new SdkAnthropicTransport(),
  }),
  await loadModelsConfig(repoModelsConfigPath()),
  new LlmEventObserver(store),
);
const runId = newUlid();
const variantId = `red-${runId.slice(-8).toLowerCase()}`;
const sandbox = new DockerSandbox({ docker, workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
const orchestrator = new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR);
const budget = { maxTokens: 2_000_000, maxEur };
let outcome: 'success' | 'error' = 'error';
let reason = 'the Red Team run did not finish';

try {
  await orchestrator.record('run.started', { budget });
  console.log(
    `Red Team run ${runId} on ${name}: ${classes.join(', ')} (engine ${engine}, budget €${String(maxEur)})`,
  );

  // What the engine works from: the surface map and the static leads, read from a throwaway clone.
  const vcs = new LocalGitAdapter();
  const workspace = await vcs.clone(surfaceTarget.repo, {
    runId,
    ref: surfaceTarget.ref ?? 'main',
    depth: 1,
  });
  let endpoints;
  let findings;
  try {
    endpoints = await new TypeScriptAttackSurface(surfaceTarget).map(workspace);
    findings = await new SemgrepAnalysis(docker, `${root}rules/semgrep`).run(workspace);
  } finally {
    await rm(workspace.path, { recursive: true, force: true });
  }
  console.log(`  ${String(endpoints.length)} endpoints, ${String(findings.length)} static leads`);

  const { baseUrl } = await sandbox.up({ id: variantId, target: name, ref: 'image' });
  const origin = new URL(baseUrl).origin;
  const policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), name, [origin]);
  const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
    runId,
    variantId,
    policy,
  });
  console.log(`  ownership verified on ${origin}`);

  const result = await new RunRedTeam({
    gateway,
    store,
    http,
    target: (client, at) => ({
      users: new JuiceShopTestUsers(client, at),
      victim: new JuiceShopVictimData(client, at),
      businessLogic: new JuiceShopBusinessLogic(client, at),
    }),
    browser,
    artifacts: new FileArtifactStore(),
  }).execute({
    runId,
    scope,
    origin,
    classes,
    endpoints,
    findings,
    engine,
    budget: new Budget(budget),
  });

  const spent = (await store.readRun(runId)).reduce(
    (sum, event) => sum + (event.cost?.estimatedEur ?? 0),
    0,
  );
  console.log(`\n${result.engine}: ${result.summary}`);
  console.log(`${String(result.attempts)} attempts, €${spent.toFixed(4)} spent`);
  console.log(`Findings confirmed by an oracle (${String(result.findings.length)}):`);
  for (const finding of result.findings) {
    console.log(
      `  ${finding.testType} at ${finding.endpoint} (#${String(finding.attempt)}): ${finding.evidence}`,
    );
  }
  console.log(
    `PoCs replayed with fresh users: ${String(result.confirmed.length)} confirmed, ${String(result.unconfirmed.length)} not reproduced (saved under .artifacts/${runId}/poc/)`,
  );
  for (const each of result.unconfirmed) console.log(`  still suspected: ${each.reason}`);
  const missing = classes.filter((each) => !result.findings.some((f) => f.testType === each));
  outcome = 'success';
  reason = missing.length === 0 ? '' : `no finding for ${missing.join(', ')}`;
  if (missing.length > 0) console.log(`Not found: ${missing.join(', ')}`);
} catch (error) {
  reason = error instanceof Error ? error.message.slice(0, 300) : String(error);
  throw error;
} finally {
  await orchestrator.record('run.completed', {
    outcome,
    ...(reason === '' ? {} : { reason }),
  });
  await http.close();
  await browser.close();
  if (!args.includes('--keep')) await sandbox.down(variantId);
  await store.close();
}
