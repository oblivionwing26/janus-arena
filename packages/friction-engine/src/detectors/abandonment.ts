import { location, type AgentSession } from '../session.js';
import type { FrictionSignalDraft } from '../signal.js';

/**
 * The persona gave up, or ran out of patience first. Running out of budget is the platform's
 * limit, not the user's, and never counts.
 */
export function detectAbandonment(session: AgentSession): FrictionSignalDraft[] {
  const ended = session.ended;
  if (ended === undefined) return [];
  const { outcome, steps } = ended.payload;
  if (outcome !== 'abandon' && outcome !== 'patience_exhausted') return [];
  return [
    {
      detector: 'abandonment',
      severity: 'high',
      agentId: session.agentId,
      evidenceEventIds: [ended.id],
      ...(steps > 0 ? location(session, steps - 1) : {}),
    },
  ];
}
