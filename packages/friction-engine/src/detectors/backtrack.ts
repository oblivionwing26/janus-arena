import type { AgentStepEvent } from '@janus/shared-kernel';

import type { FrictionConfig } from '../config.js';
import { location, pageOf, type AgentSession } from '../session.js';
import type { FrictionSignalDraft } from '../signal.js';

interface Visit {
  readonly page: string;
  readonly steps: AgentStepEvent[];
}

function visitsOf(session: AgentSession): Visit[] {
  const visits: Visit[] = [];
  for (const step of session.steps) {
    const page = pageOf(step.payload.url);
    const last = visits.at(-1);
    if (last?.page === page) last.steps.push(step);
    else visits.push({ page, steps: [step] });
  }
  return visits;
}

/**
 * Going back: an explicit `back` action, or leaving a page and returning to it right away
 * (A → B → A with B lasting at most `returnWithinSteps`) without using back.
 */
export function detectBacktracks(
  session: AgentSession,
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const drafts: FrictionSignalDraft[] = [];
  const backSteps = new Set<number>();
  for (const action of session.actions) {
    if (action.payload.action !== 'back' || !action.payload.ok) continue;
    backSteps.add(action.payload.stepIndex);
    drafts.push({
      detector: 'backtrack',
      severity: 'low',
      agentId: session.agentId,
      evidenceEventIds: [action.id],
      ...location(session, action.payload.stepIndex),
    });
  }

  const visits = visitsOf(session);
  for (let index = 2; index < visits.length; index++) {
    const [from, detour, back] = [visits[index - 2], visits[index - 1], visits[index]];
    if (from === undefined || detour === undefined || back === undefined) continue;
    if (from.page !== back.page || detour.steps.length > config.backtrack.returnWithinSteps)
      continue;
    const lastDetourStep = detour.steps.at(-1);
    const arrival = back.steps[0];
    if (lastDetourStep === undefined || arrival === undefined) continue;
    if (backSteps.has(lastDetourStep.payload.stepIndex)) continue;
    drafts.push({
      detector: 'backtrack',
      severity: 'low',
      agentId: session.agentId,
      evidenceEventIds: [lastDetourStep.id, arrival.id],
      ...location(session, arrival.payload.stepIndex),
    });
  }
  return drafts;
}
