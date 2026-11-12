// `pnpm run:blue-team <poc.json | runId --finding <findingId>> [--max-eur 0.5] [--record <dir>]`
// (F3.5 part A): takes a confirmed finding's PoC, clones the target's source without its ground
// truth (ADR 0012), lets the Blue Team fix it on janus/fix-<findingId>, builds and starts the
// patched variant in the sandbox and checks the shop still answers. Every event goes to a new
// run, so its cost shows in the console. Calls the real API: it spends money.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newUlid, proofOfConceptSchema } from '@janus/shared-kernel';

import { ProposeFix } from '../../application/blue-team/propose-fix.js';
import { LlmEventObserver } from '../../application/llm-event-observer.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { Budget } from '../../domain/llm/budget.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from '../../infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
} from '../../infrastructure/sandbox/sandbox-definition.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import {
  loadSurfaceConfig,
  repoSurfaceConfigPath,
} from '../../infrastructure/surface/surface-config.js';
import { TypeScriptAttackSurface } from '../../infrastructure/surface/typescript-attack-surface.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';

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
    'Usage: pnpm run:blue-team <poc.json | runId --finding <findingId>> [--max-eur 0.5] [--record <dir>]',
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

const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const sandbox = new DockerSandbox({
  docker: new DockerCli(required('DOCKER_HOST')),
  workspacesRoot: workspacesRoot(),
});
const http = new PlaywrightScopedHttp();
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
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.started', { budget });
  console.log(`Blue Team run ${runId} on ${poc.class} ${poc.endpoint} (finding ${findingId})`);

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

  const result = await new ProposeFix({ gateway, vcs, store, sandbox }).execute({
    runId,
    findingId,
    target: poc.target,
    poc,
    endpoint,
    workspace,
    policy: new EditPolicy(patch.blueTeam),
    allowed: patch.blueTeam.allow,
    budget: new Budget(budget),
  });

  let answers = 'not checked';
  if (result.status === 'built') {
    // The shop still answers on the patched variant: a probe, never an attack.
    const origin = new URL(result.baseUrl).origin;
    const client = http.client(
      new NetworkGuard({
        target: poc.target,
        origins: [origin],
        excludedPaths: [],
        allowedTests: ['http-probe'],
        maxRequestsPerSecond: 5,
      }),
      () => Promise.resolve(),
    );
    const reply = await client.send({
      method: 'GET',
      url: `${origin}/rest/products/search?q=Apple`,
      testType: 'http-probe',
    });
    answers = `GET /rest/products/search?q=Apple → ${String(reply.status)}, ${reply.body.includes('Apple Juice') ? 'products listed' : 'no products'}`;
    await sandbox.down(result.variantId);
  }

  const spent = (await store.readRun(runId)).reduce(
    (sum, event) => sum + (event.cost?.estimatedEur ?? 0),
    0,
  );
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.completed', {
    outcome: result.status === 'built' ? 'success' : 'error',
    ...(result.status === 'built' ? {} : { reason: result.reason }),
  });
  if (result.status === 'built') {
    console.log(
      `Built after ${String(result.attempts)} attempt(s): ${String(result.stats.filesChanged)} file(s), +${String(result.stats.added)} −${String(result.stats.removed)}, commit ${result.sha.slice(0, 10)} on janus/fix-${findingId}`,
    );
    console.log(`Patched variant: ${answers}`);
    console.log(`Summary: ${result.summary}\n\n${result.diff}`);
  } else {
    console.log(`No fix that builds after ${String(result.attempts)} attempt(s): ${result.reason}`);
  }
  console.log(`Workspace: ${workspace.path}\nCost: ${spent.toFixed(4)} €`);
} finally {
  await http.close();
  await store.close();
}
