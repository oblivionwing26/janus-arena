// Local only (`pnpm test:sandbox`): needs Docker and the socket proxy. ADR 0014: what Janus
// signs with node:crypto, the real cosign verifies, with no network and no transparency log.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runInContainer } from '../analysis/container-tool.js';
import { DockerCli } from '../sandbox/docker-cli.js';
import { workspacesRoot } from '../sandbox/workspace.js';
import { DUAL_REPORT_PREDICATE, signReport } from './report-bundle.js';
import { generateSigningKeys } from './report-signature.js';

const COSIGN =
  'ghcr.io/sigstore/cosign/cosign:v2.4.1@sha256:b03690aa52bfe94054187142fba24dc54137650682810633901767d8a3e15b31';
const docker = new DockerCli();
let dir: string;

async function bundle(report: object): Promise<string> {
  const keys = generateSigningKeys();
  const signed = signReport({
    report: {
      ...report,
      eventLogs: [{ runId: '01JC0F2MB7E0000000000000AA', sha256: 'a'.repeat(64) }],
    },
    privatePem: keys.privatePem,
    commits: [{ name: 'juice-shop', sha: 'f'.repeat(40) }],
    predicate: { tools: { node: process.version } },
  });
  const folder = await mkdtemp(join(dir, 'bundle-'));
  await writeFile(join(folder, 'dual-report.json'), signed.reportBytes);
  await writeFile(join(folder, 'dual-report.json.sig'), `${signed.signature}\n`);
  await writeFile(join(folder, 'dual-report.intoto.json'), JSON.stringify(signed.attestation));
  await writeFile(join(folder, 'janus.pub'), keys.publicPem);
  return folder;
}

const cosign = (folder: string, args: readonly string[]) =>
  runInContainer(docker, {
    image: COSIGN,
    args,
    copy: [{ from: folder, to: '/w' }],
    network: 'none',
  });

const verifyBlob = [
  'verify-blob',
  '--key',
  '/w/janus.pub',
  '--signature',
  '/w/dual-report.json.sig',
  '--insecure-ignore-tlog',
  '/w/dual-report.json',
];
const verifyAttestation = [
  'verify-blob-attestation',
  '--key',
  '/w/janus.pub',
  '--signature',
  '/w/dual-report.intoto.json',
  '--type',
  DUAL_REPORT_PREDICATE,
  '--insecure-ignore-tlog',
  '/w/dual-report.json',
];

beforeAll(async () => {
  dir = await mkdtemp(join(workspacesRoot(), 'cosign-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cosign verifies what Janus signs (F3.7, ADR 0014)', () => {
  it(
    'accepts the signature and the in-toto attestation of a report',
    async () => {
      const folder = await bundle({ format: 'janus-dual-report', version: 1 });

      const blob = await cosign(folder, verifyBlob);
      expect(`${blob.stdout}${blob.stderr}`).toContain('Verified OK');
      const attestation = await cosign(folder, verifyAttestation);
      expect(`${attestation.stdout}${attestation.stderr}`).toContain('Verified OK');
    },
    5 * 60_000,
  );

  it(
    'rejects the report once one byte changes',
    async () => {
      const folder = await bundle({ format: 'janus-dual-report', version: 1 });
      await writeFile(
        join(folder, 'dual-report.json'),
        `${JSON.stringify({ format: 'janus-dual-report', version: 2 }, null, 2)}\n`,
      );

      await expect(cosign(folder, verifyBlob)).rejects.toThrow();
      await expect(cosign(folder, verifyAttestation)).rejects.toThrow();
    },
    5 * 60_000,
  );
});
