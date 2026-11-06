import type { AgentActionEvent } from '@janus/shared-kernel';

import type { FrictionConfig } from '../config.js';
import { location, type AgentSession } from '../session.js';
import type { FrictionSignalDraft } from '../signal.js';

function targetOf(action: AgentActionEvent): string | undefined {
  return action.payload.ref ?? action.payload.selector;
}

/** Repeated clicks on the same element in a short burst of actions. */
export function detectRageClicks(
  session: AgentSession,
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const { minClicks, windowActions, windowMs } = config.rageClick;
  const actions = session.actions.filter((action) => action.payload.action !== 'wait');
  const drafts: FrictionSignalDraft[] = [];
  let index = 0;
  while (index < actions.length) {
    const first = actions[index];
    const target = first === undefined ? undefined : targetOf(first);
    if (first?.payload.action !== 'click' || target === undefined) {
      index += 1;
      continue;
    }
    const start = Date.parse(first.ts);
    const burst = actions
      .slice(index, index + windowActions)
      .filter(
        (action) =>
          action.payload.action === 'click' &&
          targetOf(action) === target &&
          Date.parse(action.ts) - start <= windowMs,
      );
    if (burst.length < minClicks) {
      index += 1;
      continue;
    }
    drafts.push({
      detector: 'rage-click',
      severity: burst.length >= minClicks + 2 ? 'high' : 'medium',
      agentId: session.agentId,
      evidenceEventIds: burst.map((action) => action.id),
      ...location(session, first.payload.stepIndex),
    });
    const last = burst.at(-1);
    index = last === undefined ? index + 1 : actions.indexOf(last) + 1;
  }
  return drafts;
}
