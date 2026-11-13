// The signed dual report and its pull request (F3.7, F3.8), shared by `pnpm janus` and the
// gate's report and pr stages (F3.9). Composition: it wires the store, the signing and GitHub.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isKnownEvent } from '@janus/shared-kernel';
import { z } from 'zod';

import { buildDualReport } from '../../application/report/build-dual-report.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { recommend } from '../../domain/fix/tradeoff.js';
import type { DualReport, ReportRunRole } from '../../domain/report/dual-report.js';
import type { OpenedPullRequest } from '../../domain/vcs/pull-request-port.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { parsePoc } from '../../infrastructure/attack/poc-files.js';
import { GitHubPullRequests } from '../../infrastructure/github/github-pull-requests.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { eventLogHash } from '../../infrastructure/report/event-log-hash.js';
import {
  loadFunnelsConfig,
  repoFunnelsConfigPath,
} from '../../infrastructure/report/funnels-config.js';
import { savedTradeoffSchema } from '../../infrastructure/report/tradeoff-file.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
} from '../../infrastructure/sandbox/sandbox-definition.js';
import { signReport, verifyBundle } from '../../infrastructure/signing/report-bundle.js';
import { formatDualReport } from '../cli/format-dual-report.js';

export const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
export const PRIVATE_KEY = `${REPO_ROOT}.janus/keys/janus.key`;
export const PUBLIC_KEY = `${REPO_ROOT}keys/janus.pub`;
export const REPORT_FILES = {
  json: 'dual-report.json',
  md: 'dual-report.md',
  sig: 'dual-report.json.sig',
  attestation: 'dual-report.intoto.json',
} as const;
export const GITHUB_APP_VARIABLES = [
  'JANUS_GITHUB_APP_ID',
  'JANUS_GITHUB_APP_KEY',
  'JANUS_GITHUB_INSTALLATION_ID',
] as const;

export const envelopeSchema = z.object({
  payloadType: z.string(),
  payload: z.string(),
  signatures: z.array(z.object({ keyid: z.string(), sig: z.string() })).min(1),
});

export interface SignedReportInput {
  readonly dir: string;
  readonly target: string;
  readonly runs: readonly { readonly role: ReportRunRole; readonly runId: string }[];
  /** Findings whose saved trade-off report (docs/reports/tradeoff-<id>.json) goes in. */
  readonly tradeoffs?: readonly string[];
  /** Commits the report judged, besides Janus's own. */
  readonly commits?: readonly { readonly name: string; readonly sha: string }[];
}

/** Build, sign and write the dual report in `dir`: the four files `pnpm janus verify` reads. */
export async function writeSignedReport(
  store: EventStorePort,
  input: SignedReportInput,
): Promise<DualReport> {
  if (!existsSync(PRIVATE_KEY)) throw new Error('No signing key: run `pnpm janus keygen` first.');
  const runs: { runId: string; role: ReportRunRole; events: readonly StoredEvent[] }[] = [];
  for (const { role, runId } of input.runs) {
    const events = await store.readRun(runId);
    if (events.length === 0) throw new Error(`Run ${runId} has no events`);
    runs.push({ runId, role, events });
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
  for (const findingId of input.tradeoffs ?? []) {
    const saved = savedTradeoffSchema.parse(
      JSON.parse(await readFile(`${REPO_ROOT}docs/reports/tradeoff-${findingId}.json`, 'utf8')),
    );
    tradeoffs.push({ findingId, rows: saved.rows, recommendation: recommend(saved.rows) });
  }

  const janusCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT })
    .toString()
    .trim();
  const definition = await loadAnySandboxDefinition(input.target);
  const models = (await loadModelsConfig(repoModelsConfigPath())).roles;
  const tools: Record<string, string> = {
    node: process.version,
    janus: janusCommit,
    ...(isImageDefinition(definition) ? { [`${input.target} image`]: definition.image } : {}),
    ...Object.fromEntries(
      Object.entries(models).map(([role, model]) => [`model ${role}`, model.model]),
    ),
  };
  const reportConfig = (await loadFunnelsConfig(repoFunnelsConfigPath()))[input.target];
  if (reportConfig === undefined) throw new Error(`config/funnels.yaml has no ${input.target}`);
  const dual = buildDualReport({
    target: input.target,
    janusCommit,
    tools,
    runs,
    pocs,
    tradeoffs,
    eventLogs: Object.fromEntries(runs.map((run) => [run.runId, eventLogHash(run.events)])),
    reportConfig,
  });
  for (const { name, sha } of input.commits ?? []) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Commit ${name}:${sha} is not a 40-hex sha`);
  }
  const signed = signReport({
    report: dual,
    privatePem: await readFile(PRIVATE_KEY, 'utf8'),
    commits: [{ name: 'janus', sha: janusCommit }, ...(input.commits ?? [])],
    predicate: { tools, runs: runs.map(({ runId, role }) => ({ runId, role })) },
  });
  await mkdir(input.dir, { recursive: true });
  await writeFile(join(input.dir, REPORT_FILES.json), signed.reportBytes);
  await writeFile(join(input.dir, REPORT_FILES.md), formatDualReport(dual));
  await writeFile(join(input.dir, REPORT_FILES.sig), `${signed.signature}\n`);
  await writeFile(
    join(input.dir, REPORT_FILES.attestation),
    `${JSON.stringify(signed.attestation, null, 2)}\n`,
  );
  return dual;
}

/** What is wrong with the signed report in `dir`, empty when nothing is. */
export async function reportProblems(
  dir: string,
  store: EventStorePort | null,
  publicKey = PUBLIC_KEY,
): Promise<string[]> {
  const reportBytes = new Uint8Array(await readFile(join(dir, REPORT_FILES.json)));
  const listed =
    (JSON.parse(new TextDecoder().decode(reportBytes)) as { eventLogs?: { runId: string }[] })
      .eventLogs ?? [];
  const eventLogs: Record<string, string> = {};
  if (store !== null) {
    for (const { runId } of listed) eventLogs[runId] = eventLogHash(await store.readRun(runId));
  }
  return verifyBundle({
    reportBytes,
    signature: (await readFile(join(dir, REPORT_FILES.sig), 'utf8')).trim(),
    attestation: envelopeSchema.parse(
      JSON.parse(await readFile(join(dir, REPORT_FILES.attestation), 'utf8')),
    ),
    publicPem: await readFile(publicKey, 'utf8'),
    ...(store === null ? {} : { eventLogs }),
  });
}

/** The GitHub App variables that are missing from the environment. */
export function missingGitHubApp(): string[] {
  return GITHUB_APP_VARIABLES.filter((name) => (process.env[name] ?? '') === '');
}

/**
 * Commit the verified report to `branch` under janus-report/ and open its pull request as the
 * GitHub App in the environment (F3.8). Nothing leaves this machine unless the report verifies.
 */
export async function openReportPullRequest(
  store: EventStorePort | null,
  input: {
    readonly workspace: string;
    readonly branch: string;
    readonly reportDir: string;
    readonly title?: string;
  },
): Promise<OpenedPullRequest> {
  const missing = missingGitHubApp();
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} not set: see the F3.8 note in docs/ROADMAP.md`);
  }
  const problems = await reportProblems(input.reportDir, store);
  if (problems.length > 0) {
    throw new Error(
      `The report does not verify, nothing was published:\n  - ${problems.join('\n  - ')}`,
    );
  }

  const path = input.workspace;
  const git = (...gitArgs: string[]) =>
    execFileSync('git', ['-c', 'user.name=Janus', '-c', 'user.email=janus@localhost', ...gitArgs], {
      cwd: path,
    })
      .toString()
      .trim();
  if (git('status', '--porcelain') !== '') throw new Error(`${path} has uncommitted changes`);
  git('checkout', '--quiet', input.branch);
  const origin = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(
    git('remote', 'get-url', 'origin'),
  );
  if (origin === null) throw new Error(`${path}'s origin is not a GitHub repository`);
  const [, owner = '', repo = ''] = origin;
  await mkdir(join(path, 'janus-report'), { recursive: true });
  for (const file of Object.values(REPORT_FILES)) {
    await copyFile(join(input.reportDir, file), join(path, 'janus-report', file));
  }
  await copyFile(PUBLIC_KEY, join(path, 'janus-report', 'janus.pub'));
  // Verified byte for byte: no checkout may rewrite their line endings (core.autocrlf).
  await writeFile(join(path, 'janus-report', '.gitattributes'), '* -text\n');
  git('add', 'janus-report');
  if (git('status', '--porcelain') !== '') {
    git(
      'commit',
      '--quiet',
      '-m',
      'docs(janus): signed dual report',
      '-m',
      'Verify with `cosign verify-blob --key janus-report/janus.pub --signature janus-report/dual-report.json.sig --insecure-ignore-tlog janus-report/dual-report.json`.',
    );
  }

  const markdown = await readFile(join(input.reportDir, REPORT_FILES.md), 'utf8');
  const body = `${markdown}\n---\n\nOpened by Janus. The signed report and its public key are in \`janus-report/\` on this branch. Janus never merges and never approves: a person reviews this pull request.\n`;
  return new GitHubPullRequests({
    appId: process.env.JANUS_GITHUB_APP_ID ?? '',
    privatePem: await readFile(process.env.JANUS_GITHUB_APP_KEY ?? '', 'utf8'),
    installationId: process.env.JANUS_GITHUB_INSTALLATION_ID ?? '',
  }).open({
    owner,
    repo,
    branch: input.branch,
    workspace: {
      id: basename(path),
      path,
      url: pathToFileURL(path).href,
      baseSha: git('rev-parse', 'HEAD'),
    },
    title: input.title ?? `Janus: ${input.branch}`,
    body,
  });
}
