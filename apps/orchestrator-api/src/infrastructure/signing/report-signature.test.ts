import { describe, expect, it } from 'vitest';

import {
  dsseSign,
  dsseVerify,
  generateSigningKeys,
  inTotoStatement,
  pae,
  sha256Hex,
  signBlob,
  verifyBlob,
} from './report-signature.js';

const keys = generateSigningKeys();
const report = new TextEncoder().encode('{"format":"janus-dual-report","version":1}\n');

describe('report signature (F3.7, ADR 0014)', () => {
  it('makes an ECDSA P-256 pair as PEM, as cosign keys are', () => {
    expect(keys.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(keys.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
  });

  it('signs a blob as base64 DER, and verifies it', () => {
    const signature = signBlob(report, keys.privatePem);

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(verifyBlob(report, signature, keys.publicPem)).toBe(true);
  });

  it('fails to verify when one byte of the blob changes, or with another key', () => {
    const signature = signBlob(report, keys.privatePem);
    const tampered = Uint8Array.from(report);
    tampered[3] = (tampered[3] ?? 0) ^ 1;

    expect(verifyBlob(tampered, signature, keys.publicPem)).toBe(false);
    expect(verifyBlob(report, signature, generateSigningKeys().publicPem)).toBe(false);
    expect(verifyBlob(report, 'not base64 at all!', keys.publicPem)).toBe(false);
  });

  it('builds DSSE pre-authentication encoding as the spec says', () => {
    expect(new TextDecoder().decode(pae('application/x', new TextEncoder().encode('hi')))).toBe(
      'DSSEv1 13 application/x 2 hi',
    );
  });

  it('wraps an in-toto statement in a signed DSSE envelope, and verifies it', () => {
    const statement = inTotoStatement(
      [{ name: 'dual-report.json', digest: { sha256: sha256Hex(report) } }],
      'https://janus.dev/dual-report/v1',
      { tools: { node: 'v24' } },
    );
    const envelope = dsseSign(statement, keys.privatePem);

    expect(envelope.payloadType).toBe('application/vnd.in-toto+json');
    expect(dsseVerify(envelope, keys.publicPem)).toEqual(statement);
    const forged = { ...envelope, payload: Buffer.from('{"_type":"x"}').toString('base64') };
    expect(dsseVerify(forged, keys.publicPem)).toBeNull();
  });

  it('hashes bytes as lowercase hex SHA-256', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
