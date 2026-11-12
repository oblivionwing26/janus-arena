import type { recommend, TradeoffRow } from '../../domain/fix/tradeoff.js';

const ratio = (count: { readonly successes: number; readonly n: number } | null) =>
  count === null ? '—' : `${String(count.successes)}/${String(count.n)}`;
const ms = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : String(Math.round(value));

/**
 * The trade-off report (F3.6) as Markdown: one row per alternative with whether the attack still
 * works (V1), the shoppers' success on the original and on the fix and the p95 of the endpoint
 * the fix touched (V3); then the recommendation code chose, and each alternative's patch.
 */
export function formatTradeoff(input: {
  readonly title: string;
  readonly findingId: string;
  readonly runId: string;
  readonly target: string;
  readonly rows: readonly TradeoffRow[];
  readonly diffs: Readonly<Record<string, string>>;
  readonly recommendation: ReturnType<typeof recommend>;
  readonly costEur: number;
}): string {
  const endpoint =
    input.rows.flatMap((row) => row.ux?.latency.map((each) => each.endpoint) ?? [])[0] ??
    'touched endpoint';
  const table = input.rows.map((row) => {
    const latency = row.ux?.latency[0];
    const exploitable =
      row.exploitable === null ? 'not measured' : row.exploitable ? '**yes**' : 'no';
    const success = row.ux === null ? '—' : `${ratio(row.ux.a)} → ${ratio(row.ux.b)}`;
    const p95 = latency === undefined ? '—' : `${ms(latency.a)} → ${ms(latency.b)} ms`;
    const v3 = row.uxPassed === null ? 'not run' : row.uxPassed ? 'passed' : 'rejected';
    return `| ${row.label} | ${exploitable} | ${success} | ${p95} | ${v3} |`;
  });
  const details = input.rows.flatMap((row) => {
    const diff = input.diffs[row.label];
    return [
      `### ${row.label}`,
      '',
      row.note === '' ? '_No notes._' : row.note,
      '',
      ...(diff === undefined ? ['_No patch that builds._'] : ['```diff', diff.trimEnd(), '```']),
      '',
    ];
  });
  return [
    `# Trade-off report: ${input.title}`,
    '',
    `Finding \`${input.findingId}\` on ${input.target} · Blue Team run \`${input.runId}\`. ` +
      'Exploitable is the PoC replayed by code on the fix (V1); success and p95 come from a ' +
      'paired SynthLab run, original against fix, with synthetic shoppers (V3). Synthetic task ' +
      'success, not conversion.',
    '',
    `| Alternative | Exploitable (V1) | Success, original → fix (V3) | p95 ${endpoint} | V3 |`,
    '| --- | --- | --- | --- | --- |',
    ...table,
    '',
    input.recommendation.row === null
      ? `**No recommendation:** ${input.recommendation.reason}.`
      : `**Recommendation:** ${input.recommendation.reason}.`,
    '',
    `Cost: ${input.costEur.toFixed(2)} €`,
    '',
    '## Alternatives',
    '',
    ...details,
  ].join('\n');
}
