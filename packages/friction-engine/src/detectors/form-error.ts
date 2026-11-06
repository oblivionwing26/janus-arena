import type { FrictionConfig } from '../config.js';
import { location, type AgentSession } from '../session.js';
import type { FrictionSignalDraft } from '../signal.js';

/**
 * Validation errors: an alert that appears on the page after an action (agent.step `alerts`,
 * F1.6). An alert that was already there is not new; the same error again is high.
 */
export function detectFormErrors(
  session: AgentSession,
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const drafts: FrictionSignalDraft[] = [];
  const seen = new Map<string, number>();
  for (let index = 1; index < session.steps.length; index++) {
    const step = session.steps[index];
    const previous = session.steps[index - 1];
    if (step === undefined || previous === undefined) continue;
    const before = new Set(previous.payload.alerts ?? []);
    const fresh = (step.payload.alerts ?? []).filter((alert) => !before.has(alert));
    if (fresh.length === 0) continue;

    const cause = session.actions.find(
      (action) => action.payload.stepIndex === previous.payload.stepIndex,
    );
    const repeats = Math.max(...fresh.map((alert) => (seen.get(alert) ?? 0) + 1));
    for (const alert of fresh) seen.set(alert, (seen.get(alert) ?? 0) + 1);
    drafts.push({
      detector: 'form-error',
      severity: repeats >= config.formError.highAfterRepeats ? 'high' : 'medium',
      agentId: session.agentId,
      evidenceEventIds: cause === undefined ? [step.id] : [cause.id, step.id],
      ...location(session, step.payload.stepIndex),
    });
  }
  return drafts;
}
