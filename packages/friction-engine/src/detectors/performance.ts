import type { FrictionConfig } from '../config.js';
import type { AgentSession } from '../session.js';
import type { FrictionSignalDraft, FrictionSeverity } from '../signal.js';

const RANK: Record<FrictionSeverity, number> = { low: 0, medium: 1, high: 2 };

function levelOf(
  value: number | undefined,
  thresholds: { medium: number; high: number },
): FrictionSeverity | undefined {
  if (value === undefined || value <= thresholds.medium) return undefined;
  return value > thresholds.high ? 'high' : 'medium';
}

/**
 * Slow or unstable pages (page.vitals, F1.6): LCP, CLS or INP above the web.dev "needs
 * improvement" line is medium, above "poor" is high. One signal per measurement, at its worst.
 */
export function detectPerformance(
  session: AgentSession,
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const { lcpMs, cls, inpMs } = config.performance;
  return session.vitals.flatMap((vitals) => {
    const levels = [
      levelOf(vitals.payload.lcpMs, lcpMs),
      levelOf(vitals.payload.cls, cls),
      levelOf(vitals.payload.inpMs, inpMs),
    ].filter((level): level is FrictionSeverity => level !== undefined);
    if (levels.length === 0) return [];
    const worst = levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    return [
      {
        detector: 'performance' as const,
        severity: worst,
        agentId: session.agentId,
        evidenceEventIds: [vitals.id],
        stepIndex: vitals.payload.stepIndex,
        url: vitals.payload.url,
      },
    ];
  });
}
