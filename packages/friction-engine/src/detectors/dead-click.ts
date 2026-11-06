import type { AgentActionEvent } from '@janus/shared-kernel';

import type { FrictionConfig } from '../config.js';
import { location, pageOf, urlAt, type AgentSession } from '../session.js';
import type { FrictionSignalDraft, FrictionSeverity } from '../signal.js';

function roleOf(action: AgentActionEvent): string | undefined {
  const selector = action.payload.selector ?? '';
  if (selector.startsWith('label=')) return 'textbox';
  return /^role=([a-z]+)/.exec(selector)?.[1];
}

function severityFor(count: number): FrictionSeverity {
  if (count >= 3) return 'high';
  return count === 2 ? 'medium' : 'low';
}

/**
 * Clicks that did nothing: the click worked, the page stayed the same and the DOM did not
 * change at all (domMutations, F1.6). One signal per element, graded by how often it happened.
 */
export function detectDeadClicks(
  session: AgentSession,
  config: FrictionConfig,
): FrictionSignalDraft[] {
  const ignored = new Set(config.deadClick.ignoreRoles);
  const byTarget = new Map<string, AgentActionEvent[]>();
  for (const action of session.actions) {
    const { payload } = action;
    if (payload.action !== 'click' || !payload.ok || payload.domMutations !== 0) continue;
    const role = roleOf(action);
    if (role !== undefined && ignored.has(role)) continue;
    const before = urlAt(session, payload.stepIndex);
    const after = urlAt(session, payload.stepIndex + 1);
    if (before !== undefined && after !== undefined && pageOf(before) !== pageOf(after)) continue;
    const target = payload.ref ?? payload.selector ?? `step-${String(payload.stepIndex)}`;
    byTarget.set(target, [...(byTarget.get(target) ?? []), action]);
  }
  return [...byTarget.values()].flatMap((clicks) => {
    const first = clicks[0];
    if (first === undefined) return [];
    return [
      {
        detector: 'dead-click' as const,
        severity: severityFor(clicks.length),
        agentId: session.agentId,
        evidenceEventIds: clicks.map((click) => click.id),
        ...location(session, first.payload.stepIndex),
      },
    ];
  });
}
