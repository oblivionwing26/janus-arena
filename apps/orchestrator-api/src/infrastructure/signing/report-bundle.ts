import {
  dsseSign,
  dsseVerify,
  inTotoStatement,
  sha256Hex,
  signBlob,
  verifyBlob,
  type DsseEnvelope,
} from './report-signature.js';

/** What the in-toto statement says the report is (ADR 0014). */
export const DUAL_REPORT_PREDICATE = 'https://janus.dev/dual-report/v1';
const REPORT_NAME = 'dual-report.json';

interface ReportWithLogs {
  readonly eventLogs: readonly { readonly runId: string; readonly sha256: string }[];
}

export interface SignedReport {
  /** The report exactly as signed: pretty JSON with a final newline. */
  readonly reportBytes: Uint8Array;
  /** `cosign sign-blob` format: base64 DER. */
  readonly signature: string;
  readonly attestation: DsseEnvelope;
}

/**
 * Signs a dual report (F3.7): the signature over its bytes, and an in-toto statement whose
 * subjects are the report, each event log it was built from and the commits it judged.
 */
export function signReport(input: {
  readonly report: ReportWithLogs;
  readonly privatePem: string;
  readonly commits: readonly { readonly name: string; readonly sha: string }[];
  readonly predicate: unknown;
}): SignedReport {
  const reportBytes = new TextEncoder().encode(`${JSON.stringify(input.report, null, 2)}\n`);
  const statement = inTotoStatement(
    [
      { name: REPORT_NAME, digest: { sha256: sha256Hex(reportBytes) } },
      ...input.report.eventLogs.map(({ runId, sha256 }) => ({
        name: `event-log/${runId}`,
        digest: { sha256 },
      })),
      ...input.commits.map(({ name, sha }) => ({ name, digest: { gitCommit: sha } })),
    ],
    DUAL_REPORT_PREDICATE,
    input.predicate,
  );
  return {
    reportBytes,
    signature: signBlob(reportBytes, input.privatePem),
    attestation: dsseSign(statement, input.privatePem),
  };
}

/**
 * What is wrong with a signed report, empty when nothing is (F3.7, `janus verify`): the signature
 * over its bytes, the attestation's signature, that the attestation names these very bytes and
 * every event log the report lists, and, when given, that each log still hashes the same.
 */
export function verifyBundle(input: {
  readonly reportBytes: Uint8Array;
  readonly signature: string;
  readonly attestation: DsseEnvelope;
  readonly publicPem: string;
  /** runId → the SHA-256 its event log has now, recomputed from the event store. */
  readonly eventLogs?: Readonly<Record<string, string>>;
}): string[] {
  const problems: string[] = [];
  if (!verifyBlob(input.reportBytes, input.signature, input.publicPem)) {
    problems.push('the signature does not match the report');
  }
  const statement = dsseVerify(input.attestation, input.publicPem);
  if (statement === null) {
    problems.push('the attestation is not signed by this key');
    return problems;
  }
  const digest = (name: string) =>
    statement.subject.find((subject) => subject.name === name)?.digest.sha256;
  if (digest(REPORT_NAME) !== sha256Hex(input.reportBytes)) {
    problems.push('the attestation names another report (its SHA-256 differs)');
  }
  let report: ReportWithLogs | null = null;
  try {
    report = JSON.parse(new TextDecoder().decode(input.reportBytes)) as ReportWithLogs;
  } catch {
    problems.push('the report is not valid JSON');
  }
  for (const { runId, sha256 } of report?.eventLogs ?? []) {
    if (digest(`event-log/${runId}`) !== sha256) {
      problems.push(`the attestation does not name the event log of run ${runId}`);
    }
    const now = input.eventLogs?.[runId];
    if (now !== undefined && now !== sha256) {
      problems.push(`the event log of run ${runId} changed since the report was signed`);
    }
  }
  return problems;
}
