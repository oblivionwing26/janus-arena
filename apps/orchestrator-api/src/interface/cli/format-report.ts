import type { SynthlabReport } from '@janus/shared-kernel';

const percent = (value: number) => `${(value * 100).toFixed(0)} %`;

/** The SynthLab report as text for the terminal (`pnpm run:report`, F1.10). */
export function formatReport(report: SynthlabReport): string {
  const lines = [
    `SynthLab report of run ${report.runId}`,
    `Sessions: ${String(report.sessions.persona)} persona, ${String(report.sessions.baseline)} baseline, ${String(report.sessions.excluded.length)} excluded`,
    '',
    'Friction zones (each session counts once, by its worst signal):',
  ];
  if (report.zones.length === 0) lines.push('  none');
  for (const zone of report.zones) {
    const detectors = zone.detectors
      .map((entry) => `${entry.detector} ×${String(entry.signals)}`)
      .join(', ');
    lines.push(
      `  ${String(zone.rank).padStart(2)}. ${zone.route} ${zone.element ?? '(page)'}: intensity ${String(zone.intensity)}, ${String(zone.sessions)} sessions; ${detectors}`,
    );
  }

  lines.push('', 'Funnel (persona sessions that reached each step in order):');
  for (const row of report.funnel) {
    const steps = row.steps
      .map((step) => `${step.name} ${String(step.reached)} (${percent(step.rate)})`)
      .join(' → ');
    lines.push(`  ${row.variant} (${String(row.sessions)}): ${steps}`);
  }

  lines.push('', 'Synthetic task success (Wilson 95 %):');
  for (const variant of report.success.variants) {
    const personas =
      variant.personas === null
        ? 'no persona sessions'
        : `${String(variant.personas.successes)}/${String(variant.personas.n)} = ${percent(variant.personas.rate)} [${percent(variant.personas.low)}, ${percent(variant.personas.high)}]`;
    lines.push(
      `  ${variant.variant}: personas ${personas}; baseline ${String(variant.baseline.successes)}/${String(variant.baseline.n)}`,
    );
  }
  const comparison = report.success.comparison;
  if (comparison?.difference != null) {
    const { mean, low, high } = comparison.difference;
    lines.push(
      `  ${comparison.b} − ${comparison.a} over ${String(comparison.pairs)} pairs: ${mean.toFixed(2)} [${low.toFixed(2)}, ${high.toFixed(2)}] → ${comparison.verdict ?? ''}`,
    );
  }

  lines.push(
    '',
    `Cost: ${report.cost.estimatedEur.toFixed(4)} € in ${String(report.cost.calls)} LLM calls`,
  );
  for (const role of report.cost.byRole) {
    lines.push(`  ${role.role}: ${role.estimatedEur.toFixed(4)} € (${String(role.calls)} calls)`);
  }
  return lines.join('\n');
}
