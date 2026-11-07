// `pnpm run:ui-engineer <runId|file> --zone <rank> [--max-eur 1] [--record <dir>]` (F2.3):
// takes a friction zone of a recorded run, clones the target, lets the UI Engineer patch it,
// runs the target's checks in a container without network (one retry) and commits a passing
// patch on janus/variant-<newRunId>. Every event of the attempt goes to a new run in the event
// store, so its cost shows in the console. Calls the real API: it spends money.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newUlid } from '@janus/shared-kernel';
import { frictionZones } from '@janus/synthlab-report';

import { LlmEventObserver } from '../../application/llm-event-observer.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { ProposeVariant } from '../../application/ui-engineer/propose-variant.js';
import { Budget } from '../../domain/llm/budget.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { DockerBuildChecks } from '../../infrastructure/checks/docker-build-checks.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from '../../infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import {
  loadFunnelsConfig,
  repoFunnelsConfigPath,
} from '../../infrastructure/report/funnels-config.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { loadReplayRun } from './replay-input.js';

const envFile = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const source = args[0];
const rank = Number(option('zone') ?? '1');
const maxEur = Number(option('max-eur') ?? '1');
const target = option('target') ?? 'shoplab';
if (source === undefined || source.startsWith('--') || !Number.isInteger(rank) || !(maxEur > 0)) {
  console.error(
    'Usage: pnpm run:ui-engineer <runId|file> --zone <rank> [--max-eur 1] [--record <dir>] [--target shoplab]',
  );
  process.exit(2);
}
const required = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

const cwd = process.env.INIT_CWD ?? process.cwd();
const store = await PostgresEventStore.connect(required('DATABASE_URL'));
try {
  const run = await loadReplayRun(source, {
    readTextFile: async (path) => {
      const full = resolve(cwd, path);
      return existsSync(full) ? readFile(full, 'utf8') : null;
    },
    readRun: (runId) => store.readRun(runId),
  });
  const routes = (await loadFunnelsConfig(repoFunnelsConfigPath()))[target]?.routes ?? [];
  const zone = frictionZones(run.events, { routes, top: 10 }).find((z) => z.rank === rank);
  if (zone === undefined) throw new Error(`Run ${run.runId} has no friction zone #${String(rank)}`);

  const definition = await loadSandboxDefinition(target);
  if (definition.uiEngineer === undefined || definition.checks === undefined) {
    throw new Error(`docker/sandboxes/${target}.yaml declares no uiEngineer policy or checks`);
  }
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
  console.log(
    `UI Engineer run ${runId} on zone #${String(rank)} ${zone.route} ${zone.element ?? '(page)'}`,
  );

  let screenshot: Uint8Array | undefined;
  if (zone.screenshot !== null) {
    screenshot = await new FileArtifactStore()
      .get(run.runId, zone.screenshot.artifact)
      .catch(() => undefined);
  }
  const vcs = new LocalGitAdapter();
  const workspace = await vcs.clone(definition.repo, {
    runId,
    ref: option('ref') ?? 'main',
    excludeFiles: definition.excludeFiles,
  });

  const result = await new ProposeVariant({
    gateway,
    vcs,
    store,
    checks: new DockerBuildChecks(new DockerCli(required('DOCKER_HOST')), definition.checks),
  }).execute({
    runId,
    zone,
    events: run.events,
    workspace,
    policy: new EditPolicy(definition.uiEngineer),
    allowed: definition.uiEngineer.allow,
    routes,
    ...(screenshot === undefined ? {} : { screenshot }),
    budget: new Budget(budget),
  });

  const spent = (await store.readRun(runId)).reduce(
    (sum, event) => sum + (event.cost?.estimatedEur ?? 0),
    0,
  );
  await new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR).record('run.completed', {
    outcome: result.status === 'verified' ? 'success' : 'error',
    ...(result.status === 'verified' ? {} : { reason: result.reason }),
  });
  if (result.status === 'verified') {
    console.log(
      `Verified after ${String(result.attempts)} attempt(s): ${String(result.stats.filesChanged)} file(s), +${String(result.stats.added)} −${String(result.stats.removed)}, commit ${result.sha.slice(0, 10)} on janus/variant-${runId}`,
    );
    console.log(`Summary: ${result.summary}\n\n${result.diff}`);
  } else {
    console.log(
      `No verified variant after ${String(result.attempts)} attempt(s): ${result.reason}`,
    );
  }
  console.log(`Workspace: ${workspace.path}\nCost: ${spent.toFixed(4)} €`);
} finally {
  await store.close();
}
