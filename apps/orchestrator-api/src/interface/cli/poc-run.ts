// `pnpm run:poc <runId|folder> [--keep]` (F3.4): replays the PoCs of a Red Team run (its
// artifacts) or of a folder of PoC files, against a fresh sandbox of their target, with fresh
// test users and a newly verified scope. Prints each verdict and records the replay as a run.
// Exits 1 when any PoC is no longer exploitable. No LLM is called.

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isKnownEvent, newUlid, type ProofOfConcept } from '@janus/shared-kernel';

import { pocKey } from '../../application/red-team/run-red-team.js';
import { ReplayPocs } from '../../application/red-team/replay-pocs.js';
import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { VerifyOwnership } from '../../application/scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { JuiceShopBusinessLogic } from '../../infrastructure/attack/juice-shop-business-logic.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { JuiceShopVictimData } from '../../infrastructure/attack/juice-shop-victim-data.js';
import { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import { parsePoc, readPocDir } from '../../infrastructure/attack/poc-files.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import {
  loadScopeConfig,
  repoScopeConfigPath,
  scopePolicyFor,
} from '../../infrastructure/scope/scope-config.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

const args = process.argv.slice(2);
const source = args[0];
if (source === undefined || source.startsWith('--')) {
  console.error('Usage: pnpm run:poc <runId|folder of PoC files> [--keep]');
  process.exit(2);
}
const required = (variable: string) => {
  const value = process.env[variable];
  if (value === undefined || value === '')
    throw new Error(`${variable} is not set (see .env.example)`);
  return value;
};

const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const folder = resolve(process.env.INIT_CWD ?? process.cwd(), source);
let pocs: { name: string; poc: ProofOfConcept }[];
if (existsSync(folder) && statSync(folder).isDirectory()) {
  pocs = [...(await readPocDir(folder))];
} else {
  // A run id: the PoCs its Red Team findings left in its artifacts.
  const artifacts = new FileArtifactStore();
  const findings = (await store.readRun(source))
    .filter(isKnownEvent)
    .flatMap((event) =>
      event.type === 'finding.created' && event.payload.tool === 'red-team'
        ? [event.payload.findingId]
        : [],
    );
  pocs = [];
  for (const findingId of findings) {
    const key = pocKey(findingId);
    const bytes = await artifacts.get(source, key).catch(() => null);
    if (bytes === null) console.log(`  no PoC saved for finding ${findingId}`);
    else pocs.push({ name: key, poc: parsePoc(new TextDecoder().decode(bytes)) });
  }
}
const targets = [...new Set(pocs.map(({ poc }) => poc.target))];
if (pocs.length === 0 || targets.length !== 1 || targets[0] === undefined) {
  await store.close();
  throw new Error(
    `Expected PoCs of one target, found ${String(pocs.length)} for ${targets.join(', ') || 'none'}`,
  );
}
const name = targets[0];

const runId = newUlid();
const variantId = `poc-${runId.slice(-8).toLowerCase()}`;
const sandbox = new DockerSandbox({
  docker: new DockerCli(required('DOCKER_HOST')),
  workspacesRoot: workspacesRoot(),
});
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightBrowserAttack();
const orchestrator = new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR);
let outcome: 'success' | 'error' = 'error';
let reason = 'the PoC replay did not finish';

try {
  await orchestrator.record('run.started', { budget: { maxTokens: 1, maxEur: 0.01 } });
  console.log(`PoC replay ${runId}: ${String(pocs.length)} PoCs of ${name}`);
  const { baseUrl } = await sandbox.up({ id: variantId, target: name, ref: 'image' });
  const origin = new URL(baseUrl).origin;
  const policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), name, [origin]);
  const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
    runId,
    variantId,
    policy,
  });

  const replayed = await new ReplayPocs({
    store,
    http,
    browser,
    target: (client, at) => ({
      users: new JuiceShopTestUsers(client, at),
      victim: new JuiceShopVictimData(client, at),
      businessLogic: new JuiceShopBusinessLogic(client, at),
    }),
  }).execute({ runId, scope, origin, pocs: pocs.map(({ poc }) => poc) });

  let failed = 0;
  replayed.forEach(({ poc, verdict }, index) => {
    const exploitable = verdict?.exploitable === true;
    if (!exploitable) failed += 1;
    console.log(
      `  ${exploitable ? 'EXPLOITABLE  ' : 'NOT REPRODUCED'} ${pocs[index]?.name ?? ''} ${poc.class} ${poc.endpoint}: ${verdict?.evidence ?? 'nothing was judged'}`,
    );
  });
  outcome = 'success';
  reason = failed === 0 ? '' : `${String(failed)} PoC(s) no longer exploitable`;
  console.log(failed === 0 ? '\nEvery PoC still reproduces.' : `\n${reason}.`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await orchestrator.record('run.completed', { outcome, ...(reason === '' ? {} : { reason }) });
  await browser.close();
  await http.close();
  if (!args.includes('--keep')) await sandbox.down(variantId);
  await store.close();
}
