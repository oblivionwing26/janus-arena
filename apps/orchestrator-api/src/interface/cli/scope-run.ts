// `pnpm run:scope <target> [--keep]` (F3.1): starts the target in the sandbox, shows that an
// offensive request is blocked before ownership is verified, verifies it with a fresh token at
// /.well-known/janus-verify.txt, then probes the scope: the app answers, its excluded paths and
// any other host are blocked. Records everything as a run. No LLM is called; nothing is attacked.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { newUlid } from '@janus/shared-kernel';

import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { recordBlocked, VerifyOwnership } from '../../application/scope/verify-ownership.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { NetworkGuard, ScopeBlockedError } from '../../domain/scope/network-guard.js';
import type { ScopedHttpClient, ScopedRequest } from '../../domain/scope/scoped-http-port.js';
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
const name = args[0];
if (name === undefined || name.startsWith('--')) {
  console.error('Usage: pnpm run:scope <target> [--keep]');
  process.exit(2);
}
const required = (variable: string) => {
  const value = process.env[variable];
  if (value === undefined || value === '')
    throw new Error(`${variable} is not set (see .env.example)`);
  return value;
};

const scopes = await loadScopeConfig(repoScopeConfigPath());
const runId = newUlid();
const variantId = `scope-${runId.slice(-8).toLowerCase()}`;
const sandbox = new DockerSandbox({
  docker: new DockerCli(required('DOCKER_HOST')),
  workspacesRoot: workspacesRoot(),
});
const http = new PlaywrightScopedHttp();
const store = await PostgresEventStore.connect(required('DATABASE_URL'));
const recorder = new RunEventRecorder(store, runId, ORCHESTRATOR_ACTOR);

async function probe(client: ScopedHttpClient, request: ScopedRequest): Promise<void> {
  const what = `${request.method} ${request.url} (${request.testType})`;
  try {
    const reply = await client.send(request);
    console.log(`  allowed  ${what} → ${String(reply.status)}`);
  } catch (error) {
    if (!(error instanceof ScopeBlockedError)) throw error;
    console.log(`  BLOCKED  ${what}: ${error.blocked.reason}`);
  }
}

let outcome: 'success' | 'error' = 'error';
try {
  console.log(`Scope check ${runId}: starting ${name} in the sandbox as ${variantId}…`);
  const { baseUrl } = await sandbox.up({ id: variantId, target: name, ref: 'image' });
  const origin = new URL(baseUrl).origin;
  const policy = scopePolicyFor(scopes, name, [origin]);
  const onBlocked = recordBlocked(recorder);

  console.log('\nBefore verifying ownership:');
  await probe(http.client(new NetworkGuard(policy), onBlocked), {
    method: 'GET',
    url: `${origin}/rest/basket/1`,
    testType: 'idor',
  });

  const scope = await new VerifyOwnership({ tokens: sandbox, http, store }).execute({
    runId,
    variantId,
    policy,
  });
  console.log(`\nOwnership verified at ${scope.verifiedAt}. With the verified scope:`);
  const client = http.client(new NetworkGuard(scope), onBlocked);
  await probe(client, { method: 'GET', url: `${origin}/`, testType: 'http-probe' });
  await probe(client, { method: 'GET', url: `${origin}/rest/basket/1`, testType: 'idor' });
  await probe(client, { method: 'GET', url: `${origin}/api/Challenges`, testType: 'http-probe' });
  await probe(client, { method: 'GET', url: `${origin}/API/challenges`, testType: 'http-probe' });
  await probe(client, { method: 'GET', url: 'http://example.com/', testType: 'http-probe' });
  await probe(client, { method: 'GET', url: `${origin}/`, testType: 'scanner' });
  outcome = 'success';
} finally {
  await recorder.record('run.completed', {
    outcome,
    ...(outcome === 'error' ? { reason: 'the scope check did not finish' } : {}),
  });
  await http.close();
  if (!args.includes('--keep')) await sandbox.down(variantId);
  await store.close();
}
