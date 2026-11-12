import { isKnownEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { buildSynthlabReport, type ReportConfig } from '@janus/synthlab-report';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import type { recommend, TradeoffRow } from '../../domain/fix/tradeoff.js';
import type {
  DualReport,
  ReportFinding,
  ReportFix,
  ReportRunRole,
} from '../../domain/report/dual-report.js';

export interface DualReportInput {
  readonly target: string;
  readonly janusCommit: string;
  readonly tools: Readonly<Record<string, string>>;
  readonly runs: readonly {
    readonly runId: string;
    readonly role: ReportRunRole;
    readonly events: readonly StoredEvent[];
  }[];
  readonly pocs: readonly { readonly findingId: string; readonly poc: ProofOfConcept }[];
  readonly tradeoffs: readonly {
    readonly findingId: string;
    readonly rows: readonly TradeoffRow[];
    readonly recommendation: ReturnType<typeof recommend>;
  }[];
  /** runId → SHA-256 of its event log. */
  readonly eventLogs: Readonly<Record<string, string>>;
  readonly reportConfig: ReportConfig;
}

/**
 * The dual report (F3.7), by code from the event logs of the runs it names: the UX A/B of the
 * `ux` run, the findings of the audit and Red Team runs with their status after confirmation,
 * each Blue Team run's fix with its verifications, the trade-off reports, the cost of every run
 * and the hash of every event log. No LLM writes any of it.
 */
export function buildDualReport(input: DualReportInput): DualReport {
  const known = (role: ReportRunRole) => input.runs.filter((run) => run.role === role);
  const pocOf = new Map(input.pocs.map(({ findingId, poc }) => [findingId, poc]));

  const uxRun = known('ux')[0];
  let ux: DualReport['ux'] = null;
  if (uxRun !== undefined) {
    const { success } = buildSynthlabReport(uxRun.runId, uxRun.events, input.reportConfig);
    ux = {
      runId: uxRun.runId,
      variants: success.variants.map(({ variant, personas, baseline }) => ({
        variant,
        personas: personas === null ? null : { successes: personas.successes, n: personas.n },
        baseline,
      })),
      difference:
        success.comparison?.difference === null || success.comparison === null
          ? null
          : {
              mean: success.comparison.difference.mean,
              low: success.comparison.difference.low,
              high: success.comparison.difference.high,
            },
      verdict: success.comparison?.verdict ?? null,
    };
  }

  const findings: ReportFinding[] = [...known('audit'), ...known('red-team')].flatMap((run) => {
    const events = run.events.filter(isKnownEvent);
    const confirmed = new Set(
      events.flatMap((event) =>
        event.type === 'finding.confirmed' ? [event.payload.findingId] : [],
      ),
    );
    return events.flatMap((event): ReportFinding[] => {
      if (event.type !== 'finding.created') return [];
      const { payload } = event;
      const place =
        payload.file === undefined
          ? (pocOf.get(payload.findingId)?.endpoint ?? '')
          : `${payload.file}${payload.line === undefined ? '' : `:${String(payload.line)}`}`;
      return [
        {
          findingId: payload.findingId,
          runId: run.runId,
          kind: payload.kind,
          severity: payload.severity,
          title: payload.title,
          status: confirmed.has(payload.findingId) ? 'confirmed' : payload.status,
          where: place,
          tool: payload.tool ?? '—',
        },
      ];
    });
  });

  const fixes: ReportFix[] = known('blue-team').flatMap((run) => {
    const events = run.events.filter(isKnownEvent);
    const remediated = events.find((event) => event.type === 'finding.remediated');
    if (remediated?.type !== 'finding.remediated') return [];
    const { findingId, status, iterations, patchId, branch } = remediated.payload;
    const proposed = events.find(
      (event) => event.type === 'patch.proposed' && event.payload.patchId === patchId,
    );
    return [
      {
        runId: run.runId,
        findingId,
        status,
        iterations,
        branch: branch ?? null,
        patchId: patchId ?? null,
        diff: proposed?.type === 'patch.proposed' ? proposed.payload.diff : null,
        verifications: events.flatMap((event) =>
          event.type === 'verification.result' &&
          (patchId === undefined || event.payload.patchId === patchId)
            ? [
                {
                  verifier: event.payload.verifier,
                  passed: event.payload.passed,
                  details: event.payload.details ?? '',
                },
              ]
            : [],
        ),
      },
    ];
  });

  const costRuns = input.runs.map((run) => ({
    runId: run.runId,
    role: run.role,
    eur: run.events.reduce((sum, event) => sum + (event.cost?.estimatedEur ?? 0), 0),
  }));
  return {
    format: 'janus-dual-report',
    version: 1,
    target: input.target,
    janusCommit: input.janusCommit,
    ux,
    findings,
    pocs: input.pocs,
    fixes,
    tradeoffs: input.tradeoffs.map(({ findingId, rows, recommendation }) => ({
      findingId,
      rows,
      recommendation: { label: recommendation.row?.label ?? null, reason: recommendation.reason },
    })),
    cost: { runs: costRuns, totalEur: costRuns.reduce((sum, run) => sum + run.eur, 0) },
    eventLogs: input.runs.map((run) => ({
      runId: run.runId,
      sha256: input.eventLogs[run.runId] ?? '',
    })),
    tools: input.tools,
  };
}
