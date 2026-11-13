// `pnpm run:gate <gates/file.yaml> [--resume <gateRunId>]` (F3.9): the whole Janus gate for one
// target. SynthLab on A → variant B → A/B → differential audit → Red Team → Blue Team → signed
// report → pull request, each stage recorded in the gate's own run. A stage the target cannot do
// is skipped with its reason. Kill it at any point and resume it with --resume: completed
// stages are not played again. Needs `pnpm dev` for SynthLab; calls the real API.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isKnownEvent } from '@janus/shared-kernel';
import { parse } from 'yaml';

import { RunJanusGate } from '../../application/gate/run-janus-gate.js';
import { LlmEventObserver } from '../../application/llm-event-observer.js';
import { GateBudget } from '../../domain/gate/gate-budget.js';
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
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import { loadGateFile } from '../gate/gate-file.js';
import { prStage, reportStage } from '../gate/delivery-stages.js';
import { auditStage, blueTeamStage, redTeamStage } from '../gate/security-stages.js';
import { abStage, synthlabAStage, variantBStage } from '../gate/synthlab-stages.js';
import { runConfigBodySchema, runConfigFromBody } from '../http/start-run-body.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const file = args[0];
const resume = option('resume');
if (
  file === undefined ||
  file.startsWith('--') ||
  (resume !== undefined && !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(resume))
) {
  console.error('Usage: pnpm run:gate <gates/file.yaml> [--resume <gateRunId>]');
  process.exit(2);
}
const required = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

const cwd = process.env.INIT_CWD ?? process.cwd();
const gate = await loadGateFile(resolve(cwd, file));
const config = runConfigFromBody(
  runConfigBodySchema.parse(parse(await readFile(resolve(root, gate.runFile), 'utf8'))),
);
if (config.target !== gate.target) {
  throw new Error(`${gate.runFile} plays ${config.target}, not ${gate.target}`);
}
const report = (await loadFunnelsConfig(repoFunnelsConfigPath()))[gate.target];
if (report === undefined) throw new Error(`config/funnels.yaml has no ${gate.target}`);

const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const docker = new DockerCli(required('DOCKER_HOST'));
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
try {
  const deps = {
    root,
    gate,
    config,
    report,
    store,
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
    docker,
    sandbox: new DockerSandbox({ docker, workspacesRoot: workspacesRoot() }),
    http,
    browser,
  };
  const janusGate = new RunJanusGate({
    store,
    stages: [
      synthlabAStage(deps),
      variantBStage(deps),
      abStage(deps),
      auditStage(deps),
      redTeamStage(deps),
      blueTeamStage(deps),
      reportStage(deps),
      prStage(deps),
    ],
  });
  console.log(
    resume === undefined
      ? `Gate on ${gate.target} (budget ${gate.budget.maxEur.toFixed(2)} €)`
      : `Resuming gate ${resume} on ${gate.target}`,
  );
  const result = await janusGate.execute({
    target: gate.target,
    budget: new GateBudget(gate.budget.maxEur, gate.budget.shares),
    ...(resume === undefined ? {} : { gateRunId: resume }),
    onStart: (gateRunId) => {
      console.log(`Gate run ${gateRunId}: resume with --resume ${gateRunId}`);
    },
  });

  console.log(`\nGate run ${result.gateRunId}`);
  const events = await store.readRun(result.gateRunId);
  for (const { stage, status } of result.stages) {
    const last = events
      .filter(isKnownEvent)
      .flatMap((event) => (event.type === 'gate.stage' ? [event.payload] : []))
      .filter((payload) => payload.stage === stage && payload.status !== 'run')
      .at(-1);
    const output = result.outputs.get(stage);
    console.log(
      `  ${stage.padEnd(10)} ${status.padEnd(9)} ${
        output === undefined ? (last?.reason ?? '') : JSON.stringify(output)
      }`,
    );
  }
  console.log(`Spent: ${result.spentEur.toFixed(4)} € of ${gate.budget.maxEur.toFixed(2)} €`);
} catch (error) {
  console.error(`\nThe gate stopped: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Resume it with the --resume line printed above.');
  process.exitCode = 1;
} finally {
  await browser.close();
  await http.close();
  await store.close();
}
