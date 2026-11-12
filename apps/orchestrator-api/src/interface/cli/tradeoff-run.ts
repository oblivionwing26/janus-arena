// `pnpm run:tradeoff <poc.json | runId --finding <findingId>> [--max-eur 0.5] [--record <dir>]
//  [--run-file runs/juice-shop-login.yaml] [--all-strategies | --strategies a,b]` (F3.6): the report of a
// confirmed finding. The Blue Team fixes it; if V3 rejects the fix, it writes one alternative per
// strategy (account lockout, progressive delay, per-account attempt limit). Each is measured with
// V1 and V3 (a paired SynthLab run on the running orchestrator: needs `pnpm dev`), and code
// recommends one. Saves the Markdown report in docs/reports/. Calls the real API: it spends money.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newUlid, proofOfConceptSchema } from '@janus/shared-kernel';
import { parse } from 'yaml';

import { ExploreTradeoffs } from '../../application/blue-team/explore-tradeoffs.js';
import {
  PocReplayVerifier,
  replayOnVariant,
} from '../../application/blue-team/poc-replay-verifier.js';
import { SynthlabRerunVerifier } from '../../application/blue-team/synthlab-rerun-verifier.js';
import { LlmEventObserver } from '../../application/llm-event-observer.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { Budget } from '../../domain/llm/budget.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from '../../infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import {
  loadFunnelsConfig,
  repoFunnelsConfigPath,
} from '../../infrastructure/report/funnels-config.js';
import { HttpSynthLab } from '../../infrastructure/run/http-synthlab.js';
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
import { runConfigBodySchema, runConfigFromBody } from '../http/start-run-body.js';
import { savedTradeoffSchema } from '../../infrastructure/report/tradeoff-file.js';
import { formatTradeoff } from './format-tradeoff.js';

const envFile = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const source = args[0];
const maxEur = Number(option('max-eur') ?? '0.5');
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const isRun = source !== undefined && ULID.test(source);
if (
  source === undefined ||
  source.startsWith('--') ||
  !(maxEur > 0) ||
  (isRun && option('finding') === undefined)
) {
  console.error(
    'Usage: pnpm run:tradeoff <poc.json | runId --finding <findingId>> [--max-eur 0.5] [--record <dir>] [--run-file <yaml>] [--all-strategies | --strategies account-lockout,progressive-delay,attempt-limit]',
  );
  process.exit(2);
}
const required = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

const cwd = process.env.INIT_CWD ?? process.cwd();
const findingId = option('finding') ?? newUlid();
if (!ULID.test(findingId)) throw new Error(`--finding ${findingId} is not a ULID`);
const poc = proofOfConceptSchema.parse(
  JSON.parse(
    isRun
      ? Buffer.from(await new FileArtifactStore().get(source, `poc/${findingId}.json`)).toString(
          'utf8',
        )
      : await readFile(resolve(cwd, source), 'utf8'),
  ),
);

const definition = await loadAnySandboxDefinition(poc.target);
if (!isImageDefinition(definition) || definition.patch === undefined) {
  throw new Error(`docker/sandboxes/${poc.target}.yaml declares no patch section`);
}
const { patch } = definition;
const surfaceTarget = (await loadSurfaceConfig(repoSurfaceConfigPath()))[poc.target];
if (surfaceTarget === undefined) throw new Error(`config/surface.yaml has no ${poc.target}`);
const scopes = await loadScopeConfig(repoScopeConfigPath());
// V3's SynthLab run: the run file with Inés, who tries five old passwords before the right one.
const runFile = resolve(cwd, option('run-file') ?? `runs/${poc.target}-login.yaml`);
const synthlabConfig = runConfigFromBody(
  runConfigBodySchema.parse(parse(await readFile(runFile, 'utf8'))),
);
const report = (await loadFunnelsConfig(repoFunnelsConfigPath()))[poc.target];
if (report === undefined) throw new Error(`config/funnels.yaml has no ${poc.target}`);

const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const docker = new DockerCli(required('DOCKER_HOST'));
const sandbox = new DockerSandbox({ docker, workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
try {
  const record = option('record');
  const gateway = new AnthropicGateway(
    new RecordedLLMAdapter({
      mode: 'record',
      dir:
        record === undefined
          ? fileURLToPath(new URL('../../../../../recordings/live/', import.meta.url))
          : resolve(cwd, record),
      inner: new SdkAnthropicTransport(),
    }),
    await loadModelsConfig(repoModelsConfigPath()),
    new LlmEventObserver(store),
  );

  const runId = newUlid();
  const budget = { maxTokens: 2_000_000, maxEur };
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.started', {
    budget,
    target: poc.target,
  });
  console.log(`Trade-off run ${runId} on ${poc.class} ${poc.endpoint} (finding ${findingId})`);

  // The source the agent edits, without the target's ground truth (ADR 0012).
  const vcs = new LocalGitAdapter();
  const workspace = await vcs.clone(patch.repo, {
    runId,
    ref: patch.ref,
    depth: 1,
    excludeFiles: patch.excludeFiles,
    stripComments: patch.stripComments,
  });
  const endpoints = await new TypeScriptAttackSurface(surfaceTarget).map(workspace);
  const endpoint =
    endpoints.find((each) => `${each.method} ${each.route}` === poc.endpoint) ?? null;

  const v1 = new PocReplayVerifier({
    replay: replayOnVariant({
      store,
      http,
      tokens: sandbox,
      browser,
      target: (client, at) => ({
        users: new JuiceShopTestUsers(client, at),
        victim: new JuiceShopVictimData(client, at),
        businessLogic: new JuiceShopBusinessLogic(client, at),
      }),
      policyFor: (target, origin) => scopePolicyFor(scopes, target, [origin]),
    }),
  });
  const v3 = new SynthlabRerunVerifier({
    synthlab: new HttpSynthLab(store, process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:3011'),
    config: synthlabConfig,
    report,
    // The endpoints whose handler or declaration lives in a file the fix changed.
    touched: (files) =>
      endpoints.filter(
        (each) =>
          files.includes(each.declaredAt.file) ||
          (each.handler !== null && files.includes(each.handler.file)),
      ),
  });

  // `--strategies a,b`: add those alternatives to this finding's saved report.
  const reports = fileURLToPath(new URL('../../../../../docs/reports/', import.meta.url));
  const saved = `${reports}tradeoff-${findingId}.json`;
  const strategies = option('strategies')?.split(',');
  const earlier =
    strategies !== undefined && existsSync(saved)
      ? savedTradeoffSchema.parse(JSON.parse(await readFile(saved, 'utf8')))
      : undefined;

  const result = await new ExploreTradeoffs({ gateway, vcs, store, sandbox, v1, v3 }).execute({
    ...(strategies === undefined ? {} : { strategies }),
    ...(earlier === undefined ? {} : { measured: { rows: earlier.rows, diffs: earlier.diffs } }),
    runId,
    findingId,
    target: poc.target,
    poc,
    endpoint,
    workspace,
    policy: new EditPolicy(patch.blueTeam),
    allowed: patch.blueTeam.allow,
    budget: new Budget(budget),
    allStrategies: args.includes('--all-strategies'),
  });

  // The cost of the whole report: what it cost before, this run and the V3 runs it started.
  const earlierRuns = new Set(
    earlier?.rows.flatMap((row) => (row.ux === null ? [] : [row.ux.runId])),
  );
  const runs = [
    runId,
    ...result.rows.flatMap((row) =>
      row.ux === null || earlierRuns.has(row.ux.runId) ? [] : [row.ux.runId],
    ),
  ];
  let spent = earlier?.costEur ?? 0;
  for (const each of runs) {
    for (const event of await store.readRun(each)) spent += event.cost?.estimatedEur ?? 0;
  }
  const fixed = result.recommendation.row !== null;
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.completed', {
    outcome: fixed ? 'success' : 'error',
    ...(fixed ? {} : { reason: result.recommendation.reason }),
  });
  const markdown = formatTradeoff({
    title: `${poc.class} at ${poc.endpoint}`,
    findingId,
    runId,
    target: poc.target,
    rows: result.rows,
    diffs: result.diffs,
    recommendation: result.recommendation,
    costEur: spent,
  });
  await mkdir(reports, { recursive: true });
  const file = `${reports}tradeoff-${findingId}.md`;
  await writeFile(file, markdown);
  await writeFile(
    saved,
    `${JSON.stringify({ rows: result.rows, diffs: result.diffs, costEur: spent }, null, 2)}\n`,
  );
  console.log(markdown.split('## Alternatives')[0]);
  console.log(`Report: ${file}\nWorkspace: ${workspace.path}`);
} finally {
  await browser.close();
  await http.close();
  await store.close();
}
