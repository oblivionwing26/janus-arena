import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';

/** An ECDSA P-256 key pair as PEM: what `cosign generate-key-pair` makes (ADR 0014). */
export interface SigningKeys {
  /** PKCS#8; never logged, never committed. */
  readonly privatePem: string;
  /** SPKI; `cosign verify-blob --key` reads it. */
  readonly publicPem: string;
}

export function generateSigningKeys(): SigningKeys {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A blob's signature as `cosign sign-blob` prints it: base64 DER ECDSA over SHA-256. */
export function signBlob(bytes: Uint8Array, privatePem: string): string {
  return sign('sha256', bytes, privatePem).toString('base64');
}

/** Whether `signature` (base64 DER) signs exactly these bytes with this public key. */
export function verifyBlob(bytes: Uint8Array, signature: string, publicPem: string): boolean {
  if (!/^[A-Za-z0-9+/]+=*$/.test(signature)) return false;
  try {
    return verify('sha256', bytes, publicPem, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export interface InTotoSubject {
  readonly name: string;
  readonly digest: Readonly<Record<string, string>>;
}

export interface InTotoStatement {
  readonly _type: 'https://in-toto.io/Statement/v1';
  readonly subject: readonly InTotoSubject[];
  readonly predicateType: string;
  readonly predicate: unknown;
}

export function inTotoStatement(
  subject: readonly InTotoSubject[],
  predicateType: string,
  predicate: unknown,
): InTotoStatement {
  return { _type: 'https://in-toto.io/Statement/v1', subject, predicateType, predicate };
}

export interface DsseEnvelope {
  readonly payloadType: string;
  /** base64 of the statement's JSON. */
  readonly payload: string;
  readonly signatures: readonly { readonly keyid: string; readonly sig: string }[];
}

const IN_TOTO = 'application/vnd.in-toto+json';

/** DSSE pre-authentication encoding: what is actually signed. */
export function pae(payloadType: string, payload: Uint8Array): Uint8Array {
  const type = Buffer.from(payloadType, 'utf8');
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${String(type.length)} `, 'utf8'),
    type,
    Buffer.from(` ${String(payload.length)} `, 'utf8'),
    payload,
  ]);
}

/** An in-toto statement in a DSSE envelope, as `cosign attest-blob` writes it. */
export function dsseSign(statement: InTotoStatement, privatePem: string): DsseEnvelope {
  const payload = Buffer.from(JSON.stringify(statement), 'utf8');
  return {
    payloadType: IN_TOTO,
    payload: payload.toString('base64'),
    signatures: [{ keyid: '', sig: signBlob(pae(IN_TOTO, payload), privatePem) }],
  };
}

/** The envelope's statement when one of its signatures is valid for this key; null otherwise. */
export function dsseVerify(envelope: DsseEnvelope, publicPem: string): InTotoStatement | null {
  if (envelope.payloadType !== IN_TOTO) return null;
  const payload = Buffer.from(envelope.payload, 'base64');
  const signed = envelope.signatures.some(({ sig }) =>
    verifyBlob(pae(envelope.payloadType, payload), sig, publicPem),
  );
  if (!signed) return null;
  try {
    return JSON.parse(payload.toString('utf8')) as InTotoStatement;
  } catch {
    return null;
  }
}
