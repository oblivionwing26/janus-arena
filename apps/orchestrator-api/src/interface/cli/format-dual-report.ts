import type { DualReport } from '../../domain/report/dual-report.js';

const ratio = (count: { readonly successes: number; readonly n: number } | null) =>
  count === null ? '—' : `${String(count.successes)}/${String(count.n)}`;
const points = (value: number) => `${(value * 100).toFixed(1)} pts`;
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * The dual report (F3.7) as Markdown, for a pull request: how to verify it, the UX A/B, the
 * security findings, each fix with its verifiers, the trade-offs, the cost and the provenance.
 * The signed JSON is the source of truth; this is a reading of it.
 */
export function formatDualReport(report: DualReport): string {
  const roleOf = new Map(report.cost.runs.map((run) => [run.runId, run.role]));
  const ux = report.ux;
  const lines = [
    `# Janus dual report: ${report.target}`,
    '',
    `Built by Janus \`${report.janusCommit.slice(0, 12)}\` from the event logs listed under Provenance. ` +
      'The signed source is `dual-report.json`. Verify it with Janus, or with cosign alone:',
    '',
    '```bash',
    'pnpm janus verify <this folder>',
    'cosign verify-blob --key keys/janus.pub --signature dual-report.json.sig --insecure-ignore-tlog dual-report.json',
    '```',
    '',
    '## UX A/B',
    '',
  ];
  if (ux === null) {
    lines.push('_No SynthLab run in this report._', '');
  } else {
    lines.push(
      `Synthetic task success of the personas in run \`${ux.runId}\` (the competent baseline is a reference, not part of the comparison). Synthetic users do not predict revenue.`,
      '',
      '| Variant | Personas | Baseline |',
      '| --- | --- | --- |',
      ...ux.variants.map(
        (variant) =>
          `| ${variant.variant} | ${ratio(variant.personas)} | ${ratio(variant.baseline)} |`,
      ),
      '',
      ux.difference === null
        ? '_No complete persona pairs to compare._'
        : `B − A: ${points(ux.difference.mean)}, 95 % interval [${points(ux.difference.low)}, ${points(ux.difference.high)}] (${ux.verdict ?? 'no verdict'}).`,
      '',
    );
  }
  lines.push(
    '## Security findings',
    '',
    '| Severity | Status | Kind | Tool | Where | Title |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.findings.map(
      (finding) =>
        `| ${finding.severity} | ${finding.status} | ${finding.kind} | ${finding.tool} | ${cell(finding.where)} | ${cell(finding.title)} |`,
    ),
    '',
    `${String(report.pocs.length)} reproducible PoC(s) are in the JSON: each confirmed finding was replayed by code with fresh test users.`,
    '',
    '## Fixes',
    '',
  );
  for (const fix of report.fixes) {
    lines.push(
      `### Finding \`${fix.findingId}\`: ${fix.status} after ${String(fix.iterations)} iteration(s)`,
      '',
      fix.branch === null ? '' : `Branch \`${fix.branch}\`, run \`${fix.runId}\`.`,
      '',
      '| Verifier | Result | Details |',
      '| --- | --- | --- |',
      ...fix.verifications.map(
        (each) =>
          `| ${each.verifier} | ${each.passed ? 'passed' : 'failed'} | ${cell(each.details)} |`,
      ),
      '',
      ...(fix.diff === null ? [] : ['```diff', fix.diff.trimEnd(), '```', '']),
    );
  }
  if (report.fixes.length === 0) lines.push('_No fixes in this report._', '');
  lines.push('## Trade-offs', '');
  for (const tradeoff of report.tradeoffs) {
    lines.push(
      `### Finding \`${tradeoff.findingId}\``,
      '',
      '| Alternative | Exploitable (V1) | Success, original → fix (V3) | p95, original → fix |',
      '| --- | --- | --- | --- |',
      ...tradeoff.rows.map((row) => {
        const latency = row.ux?.latency[0];
        const exploitable =
          row.exploitable === null ? 'not measured' : row.exploitable ? 'yes' : 'no';
        const p95 =
          latency === undefined || latency.a === null || latency.b === null
            ? '—'
            : `${String(Math.round(latency.a))} → ${String(Math.round(latency.b))} ms`;
        return `| ${row.label} | ${exploitable} | ${row.ux === null ? '—' : `${ratio(row.ux.a)} → ${ratio(row.ux.b)}`} | ${p95} |`;
      }),
      '',
      `**Recommendation:** ${tradeoff.recommendation.reason}.`,
      '',
    );
  }
  if (report.tradeoffs.length === 0) lines.push('_No trade-off reports in this report._', '');
  lines.push(
    '## Cost',
    '',
    `Total cost: ${report.cost.totalEur.toFixed(2)} €`,
    '',
    '## Provenance',
    '',
    '| Run | Role | Event log SHA-256 |',
    '| --- | --- | --- |',
    ...report.eventLogs.map(
      (log) => `| ${log.runId} | ${roleOf.get(log.runId) ?? '—'} | ${log.sha256} |`,
    ),
    '',
    '| Tool | Version |',
    '| --- | --- |',
    ...Object.entries(report.tools).map(([tool, version]) => `| ${tool} | ${cell(version)} |`),
    '',
  );
  return lines.join('\n');
}
