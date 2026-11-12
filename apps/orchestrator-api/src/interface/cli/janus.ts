// `pnpm janus <keygen | report | verify>` (F3.7, ADR 0014):
//   keygen [--force]                     the signing pair: .janus/keys/janus.key (private, never
//                                        committed) and keys/janus.pub (committed)
//   report --out <dir> --target <name> --run <role>:<runId>... [--tradeoff <findingId>...]
//          [--commit <name>:<sha>...]    the signed dual report: dual-report.json, .md, .json.sig
//                                        and .intoto.json in <dir>
//   verify <dir> [--key keys/janus.pub] [--offline]
//                                        checks the signature, the attestation and, unless
//                                        --offline, that each event log still hashes the same;
//                                        exits 1 on any problem
// No LLM is called.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isKnownEvent } from '@janus/shared-kernel';
import { z } from 'zod';

import { buildDualReport } from '../../application/report/build-dual-report.js';
import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { recommend } from '../../domain/fix/tradeoff.js';
import type { ReportRunRole } from '../../domain/report/dual-report.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { parsePoc } from '../../infrastructure/attack/poc-files.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { eventLogHash } from '../../infrastructure/report/event-log-hash.js';
import {
  loadFunnelsConfig,
  repoFunnelsConfigPath,
} from '../../infrastructure/report/funnels-config.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
} from '../../infrastructure/sandbox/sandbox-definition.js';
import { savedTradeoffSchema } from '../../infrastructure/report/tradeoff-file.js';
import { signReport, verifyBundle } from '../../infrastructure/signing/report-bundle.js';
import { generateSigningKeys } from '../../infrastructure/signing/report-signature.js';
import { formatDualReport } from './format-dual-report.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const PRIVATE_KEY = `${root}.janus/keys/janus.key`;
const PUBLIC_KEY = `${root}keys/janus.pub`;
const FILES = {
  json: 'dual-report.json',
  md: 'dual-report.md',
  sig: 'dual-report.json.sig',
  attestation: 'dual-report.intoto.json',
} as const;

const [command, ...args] = process.argv.slice(2);
const cwd = process.env.INIT_CWD ?? process.cwd();
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const options = (name: string) =>
  args.flatMap((arg, index) => (arg === `--${name}` ? [args[index + 1] ?? ''] : []));
const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const ROLES = ['ux', 'audit', 'red-team', 'blue-team', 'v3'] as const;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const envelopeSchema = z.object({
  payloadType: z.string(),
  payload: z.string(),
  signatures: z.array(z.object({ keyid: z.string(), sig: z.string() })).min(1),
});

async function keygen(): Promise<void> {
  if (existsSync(PRIVATE_KEY) && !args.includes('--force')) {
    fail(
      `${PRIVATE_KEY} exists; pass --force to replace it (reports signed with it stop verifying)`,
    );
  }
  const keys = generateSigningKeys();
  await mkdir(join(root, '.janus/keys'), { recursive: true });
  await mkdir(join(root, 'keys'), { recursive: true });
  await writeFile(PRIVATE_KEY, keys.privatePem, { mode: 0o600 });
  await chmod(PRIVATE_KEY, 0o600);
  await writeFile(PUBLIC_KEY, keys.publicPem);
  console.log(`Private key: ${PRIVATE_KEY} (keep it; never commit it)\nPublic key: ${PUBLIC_KEY}`);
}

async function report(store: PostgresEventStore): Promise<void> {
  const out = option('out');
  const target = option('target');
  if (out === undefined || target === undefined) {
    fail('Usage: pnpm janus report --out <dir> --target <name> --run <role>:<runId>...');
    return;
  }
  if (!existsSync(PRIVATE_KEY)) fail('No signing key: run `pnpm janus keygen` first.');
  const runs: { runId: string; role: ReportRunRole; events: readonly StoredEvent[] }[] = [];
  for (const spec of options('run')) {
    const [role, runId] = spec.split(':');
    if (!ROLES.includes(role as ReportRunRole) || runId === undefined || !ULID.test(runId)) {
      fail(`--run ${spec}: expected <${ROLES.join('|')}>:<runId>`);
      return;
    }
    const events = await store.readRun(runId);
    if (events.length === 0) fail(`Run ${runId} has no events`);
    runs.push({ runId, role: role as ReportRunRole, events });
  }

  // The PoCs of the confirmed Red Team findings, from the runs' artifacts.
  const artifacts = new FileArtifactStore();
  const pocs = [];
  for (const run of runs.filter((each) => each.role === 'red-team')) {
    for (const event of run.events.filter(isKnownEvent)) {
      if (event.type !== 'finding.confirmed') continue;
      const bytes = await artifacts.get(run.runId, event.payload.pocRef).catch(() => null);
      if (bytes !== null) {
        pocs.push({
          findingId: event.payload.findingId,
          poc: parsePoc(new TextDecoder().decode(bytes)),
        });
      }
    }
  }
  const tradeoffs = [];
  for (const findingId of options('tradeoff')) {
    const saved = savedTradeoffSchema.parse(
      JSON.parse(await readFile(`${root}docs/reports/tradeoff-${findingId}.json`, 'utf8')),
    );
    tradeoffs.push({ findingId, rows: saved.rows, recommendation: recommend(saved.rows) });
  }

  const janusCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  const definition = await loadAnySandboxDefinition(target);
  const models = (await loadModelsConfig(repoModelsConfigPath())).roles;
  const tools: Record<string, string> = {
    node: process.version,
    janus: janusCommit,
    ...(isImageDefinition(definition) ? { [`${target} image`]: definition.image } : {}),
    ...Object.fromEntries(
      Object.entries(models).map(([role, model]) => [`model ${role}`, model.model]),
    ),
  };
  const funnels = await loadFunnelsConfig(repoFunnelsConfigPath());
  const reportConfig = funnels[target];
  if (reportConfig === undefined) {
    fail(`config/funnels.yaml has no ${target}`);
    return;
  }
  const dual = buildDualReport({
    target,
    janusCommit,
    tools,
    runs,
    pocs,
    tradeoffs,
    eventLogs: Object.fromEntries(runs.map((run) => [run.runId, eventLogHash(run.events)])),
    reportConfig,
  });
  const commits = [
    { name: 'janus', sha: janusCommit },
    ...options('commit').map((spec) => {
      const [name = '', sha = ''] = spec.split(':');
      if (!/^[0-9a-f]{40}$/.test(sha)) fail(`--commit ${spec}: expected <name>:<40-hex sha>`);
      return { name, sha };
    }),
  ];
  const signed = signReport({
    report: dual,
    privatePem: await readFile(PRIVATE_KEY, 'utf8'),
    commits,
    predicate: { tools, runs: runs.map(({ runId, role }) => ({ runId, role })) },
  });
  const dir = resolve(cwd, out);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, FILES.json), signed.reportBytes);
  await writeFile(join(dir, FILES.md), formatDualReport(dual));
  await writeFile(join(dir, FILES.sig), `${signed.signature}\n`);
  await writeFile(join(dir, FILES.attestation), `${JSON.stringify(signed.attestation, null, 2)}\n`);
  console.log(
    `Signed dual report in ${dir}: ${String(dual.findings.length)} finding(s), ${String(dual.fixes.length)} fix(es), ${String(runs.length)} event log(s), ${dual.cost.totalEur.toFixed(2)} €`,
  );
}

async function verify(store: PostgresEventStore | null): Promise<void> {
  const target = args.find((arg) => !arg.startsWith('--'));
  if (target === undefined) {
    fail('Usage: pnpm janus verify <dir> [--key keys/janus.pub] [--offline]');
    return;
  }
  const dir = resolve(cwd, target);
  const reportBytes = new Uint8Array(await readFile(join(dir, FILES.json)));
  const signature = (await readFile(join(dir, FILES.sig), 'utf8')).trim();
  const attestation = envelopeSchema.parse(
    JSON.parse(await readFile(join(dir, FILES.attestation), 'utf8')),
  );
  const publicPem = await readFile(resolve(cwd, option('key') ?? PUBLIC_KEY), 'utf8');
  let eventLogs: Record<string, string> | undefined;
  if (store !== null) {
    const listed =
      (
        JSON.parse(new TextDecoder().decode(reportBytes)) as {
          eventLogs?: { runId: string }[];
        }
      ).eventLogs ?? [];
    eventLogs = {};
    for (const { runId } of listed) eventLogs[runId] = eventLogHash(await store.readRun(runId));
  }
  const problems = verifyBundle({
    reportBytes,
    signature,
    attestation,
    publicPem,
    ...(eventLogs === undefined ? {} : { eventLogs }),
  });
  if (problems.length === 0) {
    console.log(
      `OK: ${dir} is signed by this key, its attestation names it${eventLogs === undefined ? '' : ', and every event log still hashes the same'}.`,
    );
    return;
  }
  console.log(`NOT VERIFIED: ${dir}`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}

if (command === 'keygen') {
  await keygen();
} else if (command === 'report' || command === 'verify') {
  const url = process.env.DATABASE_URL;
  const offline =
    command === 'verify' && (args.includes('--offline') || url === undefined || url === '');
  const store = offline ? null : await PostgresEventStore.connect(url ?? '');
  try {
    if (command === 'report') {
      if (store === null) fail('DATABASE_URL is not set (see .env.example)');
      else await report(store);
    } else {
      await verify(store);
    }
  } finally {
    await store?.close();
  }
} else {
  fail('Usage: pnpm janus <keygen | report | verify> (see the header of this file)');
}
