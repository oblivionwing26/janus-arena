import { describe, expect, it } from 'vitest';

import { signReport, verifyBundle } from './report-bundle.js';
import { generateSigningKeys } from './report-signature.js';

const keys = generateSigningKeys();
const RUN = '01JC0F2KB7E0000000000000AA';
const report = {
  format: 'janus-dual-report',
  version: 1,
  eventLogs: [{ runId: RUN, sha256: 'a'.repeat(64) }],
};

function bundle() {
  return signReport({
    report,
    privatePem: keys.privatePem,
    commits: [{ name: 'juice-shop', sha: 'f'.repeat(40) }],
    predicate: { tools: { node: 'v24' } },
  });
}

describe('report bundle (F3.7, ADR 0014)', () => {
  it('signs the report bytes and attests them with the event logs and commits', () => {
    const signed = bundle();
    const statement = JSON.parse(
      Buffer.from(signed.attestation.payload, 'base64').toString('utf8'),
    ) as { subject: { name: string; digest: Record<string, string> }[] };

    expect(statement.subject.map((subject) => subject.name)).toEqual([
      'dual-report.json',
      `event-log/${RUN}`,
      'juice-shop',
    ]);
    expect(statement.subject[2]?.digest).toEqual({ gitCommit: 'f'.repeat(40) });
    expect(verifyBundle({ ...signed, publicPem: keys.publicPem })).toEqual([]);
  });

  it('fails when one byte of the report changes', () => {
    const signed = bundle();
    const bytes = Uint8Array.from(signed.reportBytes);
    const at = bytes.indexOf('1'.charCodeAt(0));
    bytes[at] = '2'.charCodeAt(0);

    const problems = verifyBundle({ ...signed, reportBytes: bytes, publicPem: keys.publicPem });

    expect(problems).toContain('the signature does not match the report');
    expect(problems).toContain('the attestation names another report (its SHA-256 differs)');
  });

  it('fails with another key, and when the attestation is forged', () => {
    const signed = bundle();

    expect(verifyBundle({ ...signed, publicPem: generateSigningKeys().publicPem })).toContain(
      'the signature does not match the report',
    );
    const forged = {
      ...signed.attestation,
      payload: Buffer.from('{"subject":[]}').toString('base64'),
    };
    expect(verifyBundle({ ...signed, attestation: forged, publicPem: keys.publicPem })).toContain(
      'the attestation is not signed by this key',
    );
  });

  it('fails when an event log no longer hashes as the report says', () => {
    const signed = bundle();

    expect(
      verifyBundle({
        ...signed,
        publicPem: keys.publicPem,
        eventLogs: { [RUN]: 'b'.repeat(64) },
      }),
    ).toEqual([`the event log of run ${RUN} changed since the report was signed`]);
  });
});
