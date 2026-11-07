// `pnpm run:ab-auto <runs/file.yaml> [--zones 2] [--from <runId>] [--engineer-eur 0.5]` (F2.4):
// one command for the automatic A/B. SynthLab plays variant A of the run file on the running
// orchestrator (`pnpm dev`), the UI Engineer patches its most intense zones here (each patch
// verified by the target's checks in a container), and a paired run compares A with the
// generated B. Prints the report and saves it in docs/reports/. Calls the real API.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { GenerateAndCompareVariant } from '../../application/generate-and-compare-variant.js';
import { LlmEventObserver } from '../../application/llm-event-observer.js';
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
import { HttpSynthLab } from '../../infrastructure/run/http-synthlab.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { runConfigBodySchema, runConfigFromBody } from '../http/start-run-body.js';
import { formatReport } from './format-report.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const envFile = `${root}.env`;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const file = args[0];
const zones = Number(option('zones') ?? '2');
const engineerEur = Number(option('engineer-eur') ?? '0.5');
const fromRunId = option('from');
if (
  file === undefined ||
  file.startsWith('--') ||
  !(zones >= 1 && zones <= 5) ||
  !(engineerEur > 0)
) {
  console.error(
    'Usage: pnpm run:ab-auto <runs/file.yaml> [--zones 2] [--from <runId>] [--engineer-eur 0.5]',
  );
  process.exit(2);
}
const required = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const parsed = runConfigBodySchema.safeParse(parse(await readFile(path, 'utf8')));
if (!parsed.success) {
  console.error(`${file} is not a valid run file:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const config = runConfigFromBody(parsed.data);
const definition = await loadSandboxDefinition(config.target);
const report = (await loadFunnelsConfig(repoFunnelsConfigPath()))[config.target];
if (
  definition.uiEngineer === undefined ||
  definition.checks === undefined ||
  report === undefined
) {
  throw new Error(`${config.target} needs a uiEngineer policy, checks and report settings`);
}

const store = await PostgresEventStore.connect(required('DATABASE_URL'));
try {
  const vcs = new LocalGitAdapter();
  const result = await new GenerateAndCompareVariant({
    synthlab: new HttpSynthLab(store, process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:3011'),
    gateway: new AnthropicGateway(
      new RecordedLLMAdapter({
        mode: 'record',
        dir: `${root}recordings/live/`,
        inner: new SdkAnthropicTransport(),
      }),
      await loadModelsConfig(repoModelsConfigPath()),
      new LlmEventObserver(store),
    ),
    vcs,
    store,
    checks: new DockerBuildChecks(new DockerCli(required('DOCKER_HOST')), definition.checks),
  }).execute({
    config,
    target: {
      repo: definition.repo,
      excludeFiles: definition.excludeFiles,
      policy: new EditPolicy(definition.uiEngineer),
      allowed: definition.uiEngineer.allow,
    },
    report,
    zones,
    engineerBudget: { maxTokens: 2_000_000, maxEur: engineerEur },
    ...(fromRunId === undefined ? {} : { fromRunId }),
    screenshot: (runId, artifact) =>
      new FileArtifactStore().get(runId, artifact).catch(() => undefined),
  });

  console.log(`Discovery run: ${result.discoveryRunId}`);
  console.log(`UI Engineer run: ${result.variantRunId}`);
  for (const { zone, result: attempt } of result.attempts) {
    console.log(
      attempt.status === 'verified'
        ? `  zone #${String(zone)}: verified in ${String(attempt.attempts)} attempt(s), +${String(attempt.stats.added)} −${String(attempt.stats.removed)}: ${attempt.summary.split('\n')[0] ?? ''}`
        : `  zone #${String(zone)}: no patch (${attempt.reason})`,
    );
  }
  if (result.status === 'no-variant') {
    console.log('No verified patch: no A/B run.');
  } else {
    const out = `${root}docs/reports/ab-auto-${result.abRunId}.json`;
    await mkdir(`${root}docs/reports`, { recursive: true });
    await writeFile(out, `${JSON.stringify(result.report, null, 2)}\n`);
    console.log(`A/B run: ${result.abRunId} (B = ${result.branch})\n`);
    console.log(formatReport(result.report));
    console.log(`\nReport saved to docs/reports/ab-auto-${result.abRunId}.json`);
  }
} finally {
  await store.close();
}
