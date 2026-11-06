import type { FrictionConfig } from '../config.js';
import { effectiveSteps, type AgentSession } from '../session.js';
import type { FrictionSignalDraft, FrictionSeverity } from '../signal.js';

function succeeded(session: AgentSession): boolean {
  return session.ended?.payload.outcome === 'success';
}

/**
 * A persona that reached the goal with many more steps than the competent baseline of the same
 * run. Waits are not counted. No successful baseline, no comparison.
 */
export function detectExtraSteps(
  sessions: readonly AgentSession[],
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const baselines = sessions.filter(
    (session) => session.role === 'competent-baseline' && succeeded(session),
  );
  const baseline = baselines.sort((a, b) => effectiveSteps(a) - effectiveSteps(b))[0];
  if (baseline?.ended === undefined) return [];
  const reference = effectiveSteps(baseline);
  if (reference <= 0) return [];

  const { low, medium, high } = config.extraSteps;
  return sessions.flatMap((session) => {
    if (session === baseline || session.role === 'competent-baseline') return [];
    if (!succeeded(session) || session.ended === undefined) return [];
    const ratio = effectiveSteps(session) / reference;
    if (ratio < low) return [];
    const severity: FrictionSeverity = ratio >= high ? 'high' : ratio >= medium ? 'medium' : 'low';
    return [
      {
        detector: 'extra-steps' as const,
        severity,
        agentId: session.agentId,
        evidenceEventIds: [session.ended.id, baseline.ended?.id ?? session.ended.id],
      },
    ];
  });
}
