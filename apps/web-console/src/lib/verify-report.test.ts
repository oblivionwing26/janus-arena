import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  derToRawSignature,
  verifyReport,
  type DsseEnvelope,
  type StoredEvent,
} from './verify-report';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const repo = new URL('../../../../', import.meta.url);
const bytes = (path: string) => new Uint8Array(readFileSync(new URL(path, repo)));
const text = (path: string) => readFileSync(new URL(path, repo), 'utf8');

const GATE = 'docs/reports/gate-01M79YYR766FTNCYF5STGZ3ANY/';
const PUBLIC = 'apps/web-console/public/demo/verify/';

const reportBytes = bytes(`${GATE}dual-report.json`);
const signature = text(`${GATE}dual-report.json.sig`);
const attestation = JSON.parse(text(`${GATE}dual-report.intoto.json`)) as DsseEnvelope;
const publicPem = text('keys/janus.pub');
const report = JSON.parse(text(`${GATE}dual-report.json`)) as { eventLogs: { runId: string }[] };
const eventLogs = Object.fromEntries(
  report.eventLogs.map(({ runId }) => [
    runId,
    (
      JSON.parse(text(`apps/web-console/public/demo/runs/${runId}.json`)) as {
        events: StoredEvent[];
      }
    ).events,
  ]),
);

const problems = (results: Awaited<ReturnType<typeof verifyReport>>) =>
  results.flatMap((r) => r.problems);

describe('verifyReport on the signed Juice Shop gate report', () => {
  it('serves byte-identical copies of the report, signature, attestation and key', () => {
    for (const f of ['dual-report.json', 'dual-report.json.sig', 'dual-report.intoto.json']) {
      expect(bytes(`${PUBLIC}${f}`)).toEqual(bytes(`${GATE}${f}`));
    }
    // The key is a text file that git may check out with CRLF; the served copy keeps LF.
    expect(text(`${PUBLIC}janus.pub`)).toBe(text('keys/janus.pub').replace(/\r\n/g, '\n'));
  });

  it('passes every check, the four event logs recomputed from the demo runs', async () => {
    const results = await verifyReport(subtle, {
      reportBytes,
      signature,
      attestation,
      publicPem,
      eventLogs,
    });
    expect(results.map((r) => [r.id, r.ok])).toEqual([
      ['signature', true],
      ['attestation', true],
      ['report-digest', true],
      ['event-logs', true],
    ]);
    expect(results[3]?.detail).toHaveLength(4);
  });

  it('breaks the signature and the digest when one figure of the report changes', async () => {
    const forged = new TextEncoder().encode(
      new TextDecoder()
        .decode(reportBytes)
        .replace('"totalEur": 0.8215338425999998', '"totalEur": 0.0215338425999998'),
    );
    expect(forged).not.toEqual(reportBytes);
    const results = await verifyReport(subtle, {
      reportBytes: forged,
      signature,
      attestation,
      publicPem,
      eventLogs,
    });
    expect(problems(results)).toEqual([
      'the signature does not match the report',
      'the attestation names another report (its SHA-256 differs)',
    ]);
  });

  it('notices an event log edited after signing', async () => {
    const red = '01M79ZA35SZ9QRNF6K3AAGXNQN';
    const edited = (eventLogs[red] ?? []).map((e) =>
      e.type === 'finding.confirmed'
        ? { ...e, payload: { ...(e.payload as object), evidence: 'nothing' } }
        : e,
    );
    const results = await verifyReport(subtle, {
      reportBytes,
      signature,
      attestation,
      publicPem,
      eventLogs: { ...eventLogs, [red]: edited },
    });
    expect(problems(results)).toEqual([
      `the event log of run ${red} changed since the report was signed`,
    ]);
  });

  it('rejects a signature from another key or a garbled one', async () => {
    const results = await verifyReport(subtle, {
      reportBytes,
      signature: 'not base64!',
      attestation: { ...attestation, signatures: [{ keyid: '', sig: signature }] },
      publicPem,
    });
    expect(problems(results)).toEqual([
      'the signature does not match the report',
      'the attestation is not signed by this key',
    ]);
  });
});

describe('derToRawSignature', () => {
  it('turns DER into 64 bytes of r||s and refuses junk', () => {
    const der = new Uint8Array(Buffer.from(signature.trim(), 'base64'));
    expect(derToRawSignature(der)?.length).toBe(64);
    expect(derToRawSignature(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
