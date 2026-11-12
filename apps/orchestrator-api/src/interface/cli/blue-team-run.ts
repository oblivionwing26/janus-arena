// `pnpm run:blue-team <poc.json | runId --finding <findingId>> [--max-eur 0.5] [--record <dir>]`
// (F3.5): takes a confirmed finding's PoC, clones the target's source without its ground truth
// (ADR 0012) and runs the Blue Team loop: a fix on janus/fix-<findingId>, its patched variant
// built in the sandbox, then V1 (the PoC no longer works) and V2 (the target's tests and a
// regression test, base against fix), at most 3 iterations. Every event goes to a new run, so
// its cost shows in the console. Calls the real API: it spends money.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isKnownEvent, newUlid, proofOfConceptSchema } from '@janus/shared-kernel';

import {
  PocReplayVerifier,
  replayOnVariant,
} from '../../application/blue-team/poc-replay-verifier.js';
import { RegressionTestsVerifier } from '../../application/blue-team/regression-tests-verifier.js';
import { RemediateFinding } from '../../application/blue-team/remediate-finding.js';
import { LlmEventObserver } from '../../application/llm-event-observer.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { Budget } from '../../domain/llm/budget.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { juiceShopRegressionTest } from '../../infrastructure/attack/juice-shop-regression-test.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import { DockerTargetTests } from '../../infrastructure/checks/docker-target-tests.js';
import {
  loadVulnerabilityTests,
  repoVulnerabilityTestsPath,
} from '../../infrastructure/checks/vulnerability-tests-config.js';
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
const scopes = await loadScopeConfig(repoScopeConfigPath());

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

  const v2 = new RegressionTestsVerifier({
    tests: new DockerTargetTests({ docker, workspacesRoot: workspacesRoot() }),
    generate: juiceShopRegressionTest,
    vulnerable: await loadVulnerabilityTests(repoVulnerabilityTestsPath()),
  });
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

  const result = await new RemediateFinding({
    gateway,
    vcs,
    store,
    sandbox,
    verifiers: [v1, v2],
    regressionTest: (fix) => v2.regressionTest(fix),
  }).execute({
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

  const events = (await store.readRun(runId)).filter(isKnownEvent);
  const spent = events.reduce((sum, event) => sum + (event.cost?.estimatedEur ?? 0), 0);
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.completed', {
    outcome: result.status === 'fixed' ? 'success' : 'error',
    ...(result.status === 'fixed' ? {} : { reason: result.reason }),
  });
  for (const event of events) {
    if (event.type === 'verification.result') {
      const { verifier, passed, details } = event.payload;
      console.log(`  ${passed ? 'PASS' : 'FAIL'} ${verifier}: ${details ?? ''}`);
    }
  }
  if (result.status === 'fixed') {
    console.log(
      `Fixed after ${String(result.iterations)} iteration(s): commit ${result.sha.slice(0, 10)} on janus/fix-${findingId}`,
    );
    console.log(`Summary: ${result.summary}\n\n${result.diff}`);
  } else {
    console.log(`Still open after ${String(result.iterations)} iterations: ${result.reason}`);
  }
  console.log(`Workspace: ${workspace.path}\nCost: ${spent.toFixed(4)} €`);
} finally {
  await browser.close();
  await http.close();
  await store.close();
}
