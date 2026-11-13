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
//   pr --workspace <clone> --branch <janus/...> --report <dir> [--title <text>]  (F3.8)
//                                        checks the report, commits it to the branch under
//                                        janus-report/ and opens the pull request as the GitHub
//                                        App in .env; never merges, never approves
// No LLM is called.

import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ReportRunRole } from '../../domain/report/dual-report.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { generateSigningKeys } from '../../infrastructure/signing/report-signature.js';
import {
  openReportPullRequest,
  PRIVATE_KEY,
  PUBLIC_KEY,
  REPO_ROOT as root,
  reportProblems,
  writeSignedReport,
} from '../report/signed-report.js';

if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

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
  console.log(`Private key: ${PRIVATE_KEY} (keep it; never commit it)
Public key: ${PUBLIC_KEY}`);
}

async function report(store: PostgresEventStore): Promise<void> {
  const out = option('out');
  const target = option('target');
  if (out === undefined || target === undefined) {
    fail('Usage: pnpm janus report --out <dir> --target <name> --run <role>:<runId>...');
    return;
  }
  const runs = options('run').map((spec) => {
    const [role = '', runId = ''] = spec.split(':');
    if (!ROLES.includes(role as ReportRunRole) || !ULID.test(runId)) {
      fail(`--run ${spec}: expected <${ROLES.join('|')}>:<runId>`);
    }
    return { role: role as ReportRunRole, runId };
  });
  const commits = options('commit').map((spec) => {
    const [name = '', sha = ''] = spec.split(':');
    if (!/^[0-9a-f]{40}$/.test(sha)) fail(`--commit ${spec}: expected <name>:<40-hex sha>`);
    return { name, sha };
  });
  const dir = resolve(cwd, out);
  const dual = await writeSignedReport(store, {
    dir,
    target,
    runs,
    tradeoffs: options('tradeoff'),
    commits,
  });
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
  const key = option('key');
  const problems = await reportProblems(
    dir,
    store,
    key === undefined ? PUBLIC_KEY : resolve(cwd, key),
  );
  if (problems.length === 0) {
    console.log(
      `OK: ${dir} is signed by this key, its attestation names it${store === null ? '' : ', and every event log still hashes the same'}.`,
    );
    return;
  }
  console.log(`NOT VERIFIED: ${dir}`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}

async function pullRequest(store: PostgresEventStore | null): Promise<void> {
  const workspace = option('workspace');
  const branch = option('branch');
  const reportDir = option('report');
  if (workspace === undefined || branch === undefined || reportDir === undefined) {
    fail(
      'Usage: pnpm janus pr --workspace <clone> --branch <janus/...> --report <dir> [--title <text>]',
    );
    return;
  }
  const title = option('title');
  const opened = await openReportPullRequest(store, {
    workspace: resolve(cwd, workspace),
    branch,
    reportDir: resolve(cwd, reportDir),
    ...(title === undefined ? {} : { title }),
  }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
  console.log(`${opened.existed ? 'Already open' : 'Opened'}: ${opened.url} (into ${opened.base})`);
}

if (command === 'keygen') {
  await keygen();
} else if (command === 'pr') {
  const url = process.env.DATABASE_URL;
  const store = url === undefined || url === '' ? null : await PostgresEventStore.connect(url);
  try {
    await pullRequest(store);
  } finally {
    await store?.close();
  }
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
  fail('Usage: pnpm janus <keygen | report | verify | pr> (see the header of this file)');
}
