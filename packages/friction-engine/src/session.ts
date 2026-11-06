import {
  isKnownEvent,
  type AgentActionEvent,
  type AgentStepEvent,
  type JanusEvent,
  type PageErrorEvent,
  type PageVitalsEvent,
  type SessionEndedEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';

/** One agent's events in a run, split by kind and in seq order. */
export interface AgentSession {
  readonly agentId: string;
  readonly role: string;
  readonly actions: readonly AgentActionEvent[];
  readonly steps: readonly AgentStepEvent[];
  readonly errors: readonly PageErrorEvent[];
  readonly vitals: readonly PageVitalsEvent[];
  readonly ended: SessionEndedEvent | undefined;
}

interface MutableSession {
  agentId: string;
  role: string;
  actions: AgentActionEvent[];
  steps: AgentStepEvent[];
  errors: PageErrorEvent[];
  vitals: PageVitalsEvent[];
  ended: SessionEndedEvent | undefined;
}

/** Groups a run's events by agent session. The orchestrator and unknown event types are left out. */
export function sessionsOf(events: readonly (JanusEvent | UnknownEvent)[]): AgentSession[] {
  const sessions = new Map<string, MutableSession>();
  const ordered = events.filter(isKnownEvent).sort((a, b) => a.seq - b.seq);
  for (const event of ordered) {
    if (event.actor.role === 'orchestrator') continue;
    let session = sessions.get(event.actor.agentId);
    if (session === undefined) {
      session = {
        agentId: event.actor.agentId,
        role: event.actor.role,
        actions: [],
        steps: [],
        errors: [],
        vitals: [],
        ended: undefined,
      };
      sessions.set(event.actor.agentId, session);
    }
    switch (event.type) {
      case 'agent.action':
        session.actions.push(event);
        break;
      case 'agent.step':
        session.steps.push(event);
        break;
      case 'page.error':
        session.errors.push(event);
        break;
      case 'page.vitals':
        session.vitals.push(event);
        break;
      case 'session.ended':
        session.ended = event;
        break;
      default:
        break;
    }
  }
  return [...sessions.values()];
}

/** The page an agent was on at a step, from its agent.step event. */
export function urlAt(session: AgentSession, stepIndex: number): string | undefined {
  return session.steps.find((step) => step.payload.stepIndex === stepIndex)?.payload.url;
}

/** Path of a URL: two visits to the same page compare equal, whatever the query. */
export function pageOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

/** Steps the agent actually took, leaving out waits (a wait is not friction by itself). */
export function effectiveSteps(session: AgentSession): number {
  const total = session.ended?.payload.steps ?? session.steps.length;
  return total - session.actions.filter((action) => action.payload.action === 'wait').length;
}

/** Where a draft points: the step and its URL when known. */
export function location(
  session: AgentSession,
  stepIndex: number,
): { stepIndex: number; url?: string } {
  const url = urlAt(session, stepIndex);
  return url === undefined ? { stepIndex } : { stepIndex, url };
}
