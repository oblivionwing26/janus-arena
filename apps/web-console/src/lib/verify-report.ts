// Phase 8 of the launch page: a signed dual report verified in the browser with WebCrypto. The
// same checks, in the same order and with the same messages, as `pnpm janus verify` (verifyBundle
// in the orchestrator): the signature over the report's bytes, the attestation's signature, that
// the attestation names these bytes and every event log, and that each log still hashes the same.

export const REPORT_NAME = 'dual-report.json';
const IN_TOTO = 'application/vnd.in-toto+json';

export interface DsseEnvelope {
  payloadType: string;
  payload: string;
  signatures: { keyid: string; sig: string }[];
}

export interface StoredEvent {
  seq: number;
  [key: string]: unknown;
}

export type CheckId = 'signature' | 'attestation' | 'report-digest' | 'event-logs';

export interface CheckResult {
  id: CheckId;
  ok: boolean;
  /** The problem as `janus verify` words it, when not ok. */
  problems: string[];
  /** What was compared, for the page: expected and actual digests. */
  detail?: { expected: string; actual: string }[];
}

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The bytes of a PEM block (SPKI public key). */
export function pemToDer(pem: string): Uint8Array {
  return b64ToBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
}

/**
 * A DER ECDSA signature (what cosign and node:crypto write) as the raw r||s WebCrypto expects.
 * Returns null for anything that is not a well-formed P-256 DER signature.
 */
export function derToRawSignature(der: Uint8Array): Uint8Array | null {
  if (der[0] !== 0x30 || der.length < 8) return null;
  let i = 2;
  if ((der[1] ?? 0) & 0x80) i = 2 + ((der[1] ?? 0) & 0x7f);
  const read = (): Uint8Array | null => {
    if (der[i] !== 0x02) return null;
    const len = der[i + 1] ?? 0;
    const start = i + 2;
    i = start + len;
    let v = der.slice(start, start + len);
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) return null;
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read();
  const s = read();
  return r && s ? concat(r, s) : null;
}

/** DSSE pre-authentication encoding: what an attestation actually signs. */
export function pae(payloadType: string, payload: Uint8Array): Uint8Array {
  const type = enc.encode(payloadType);
  return concat(
    enc.encode(`DSSEv1 ${String(type.length)} `),
    type,
    enc.encode(` ${String(payload.length)} `),
    payload,
  );
}

/** JSON with object keys sorted at every level, as the orchestrator's canonicalJson writes it. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(subtle: SubtleCrypto, bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
  const digest = await subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The SHA-256 of a run's event log: events in seq order, one canonical JSON line each. */
export function eventLogHash(
  subtle: SubtleCrypto,
  events: readonly StoredEvent[],
): Promise<string> {
  const lines = [...events].sort((a, b) => a.seq - b.seq).map(canonicalJson);
  return sha256Hex(subtle, lines.join('\n'));
}

async function verifyBlob(
  subtle: SubtleCrypto,
  key: CryptoKey,
  bytes: Uint8Array,
  signatureB64: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9+/]+=*$/.test(signatureB64)) return false;
  const raw = derToRawSignature(b64ToBytes(signatureB64));
  if (!raw) return false;
  try {
    return await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      raw as BufferSource,
      bytes as BufferSource,
    );
  } catch {
    return false;
  }
}

export interface VerifyInput {
  reportBytes: Uint8Array;
  signature: string;
  attestation: DsseEnvelope;
  publicPem: string;
  /** runId → its events, to recompute each listed log's hash. */
  eventLogs?: Readonly<Record<string, readonly StoredEvent[]>>;
}

/** Every check, in order; a check that cannot run (after a failed attestation) is reported failed. */
export async function verifyReport(
  subtle: SubtleCrypto,
  input: VerifyInput,
): Promise<CheckResult[]> {
  const key = await subtle.importKey(
    'spki',
    pemToDer(input.publicPem) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const results: CheckResult[] = [];

  const sigOk = await verifyBlob(subtle, key, input.reportBytes, input.signature.trim());
  results.push({
    id: 'signature',
    ok: sigOk,
    problems: sigOk ? [] : ['the signature does not match the report'],
  });

  type Statement = { subject: { name: string; digest: { sha256?: string } }[] };
  let statement = null as Statement | null;
  if (input.attestation.payloadType === IN_TOTO) {
    const payload = b64ToBytes(input.attestation.payload);
    let signed = false;
    for (const { sig } of input.attestation.signatures) {
      if (await verifyBlob(subtle, key, pae(input.attestation.payloadType, payload), sig))
        signed = true;
    }
    if (signed) {
      try {
        statement = JSON.parse(new TextDecoder().decode(payload)) as Statement;
      } catch {
        statement = null;
      }
    }
  }
  results.push({
    id: 'attestation',
    ok: statement !== null,
    problems: statement ? [] : ['the attestation is not signed by this key'],
  });
  if (!statement) {
    results.push({ id: 'report-digest', ok: false, problems: [] });
    results.push({ id: 'event-logs', ok: false, problems: [] });
    return results;
  }

  const digest = (name: string) => statement?.subject.find((s) => s.name === name)?.digest.sha256;
  const actual = await sha256Hex(subtle, input.reportBytes);
  const expected = digest(REPORT_NAME) ?? '';
  results.push({
    id: 'report-digest',
    ok: expected === actual,
    problems:
      expected === actual ? [] : ['the attestation names another report (its SHA-256 differs)'],
    detail: [{ expected, actual }],
  });

  const logProblems: string[] = [];
  const logDetail: { expected: string; actual: string }[] = [];
  type Listed = { eventLogs?: { runId: string; sha256: string }[] };
  let report = null as Listed | null;
  try {
    report = JSON.parse(new TextDecoder().decode(input.reportBytes)) as Listed;
  } catch {
    logProblems.push('the report is not valid JSON');
  }
  for (const { runId, sha256 } of report?.eventLogs ?? []) {
    if (digest(`event-log/${runId}`) !== sha256) {
      logProblems.push(`the attestation does not name the event log of run ${runId}`);
    }
    const events = input.eventLogs?.[runId];
    if (events) {
      const now = await eventLogHash(subtle, events);
      logDetail.push({ expected: sha256, actual: now });
      if (now !== sha256)
        logProblems.push(`the event log of run ${runId} changed since the report was signed`);
    }
  }
  results.push({
    id: 'event-logs',
    ok: logProblems.length === 0,
    problems: logProblems,
    detail: logDetail,
  });
  return results;
}
