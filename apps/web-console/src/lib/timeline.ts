import { isKnownEvent, type JanusEvent } from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';

export type Tone = 'neutral' | 'ok' | 'warning' | 'error';

export interface TimelineItem {
  readonly seq: number;
  readonly ts: string;
  readonly type: string;
  readonly label: string;
  readonly tone: Tone;
  readonly known: boolean;
}

export interface TimelineLane {
  readonly agentId: string;
  readonly role: string;
  readonly items: readonly TimelineItem[];
}

export interface Timeline {
  readonly lanes: readonly TimelineLane[];
  /** Every event type in the run, sorted, regardless of the filter. */
  readonly types: readonly string[];
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function describe(event: JanusEvent): { label: string; tone: Tone } {
  switch (event.type) {
    case 'run.started': {
      const { maxTokens, maxEur } = event.payload.budget;
      return {
        label: `Inicio · presupuesto ${String(maxTokens)} tokens / ${maxEur.toFixed(2)} €`,
        tone: 'neutral',
      };
    }
    case 'run.completed': {
      const { outcome, reason } = event.payload;
      return {
        label: `Fin · ${outcome}${reason === undefined ? '' : ` (${reason})`}`,
        tone: outcome === 'success' ? 'ok' : 'error',
      };
    }
    case 'agent.step':
      return {
        label: `Paso ${String(event.payload.stepIndex)} → ${pathOf(event.payload.url)}`,
        tone: 'neutral',
      };
    case 'agent.action': {
      const { action, selector, ok } = event.payload;
      return {
        label: [action, selector, ok ? undefined : '✗'].filter(Boolean).join(' '),
        tone: ok ? 'neutral' : 'error',
      };
    }
    case 'llm.call':
      return { label: `LLM ${event.payload.role} · ${event.payload.model}`, tone: 'neutral' };
    case 'budget.threshold':
      return {
        label: `Presupuesto: ${event.payload.level === 'warning' ? 'aviso 80 %' : 'agotado'}`,
        tone: event.payload.level === 'warning' ? 'warning' : 'error',
      };
    case 'friction.signal':
      return {
        label: `Fricción: ${event.payload.detector} (${event.payload.severity})`,
        tone: 'warning',
      };
    case 'finding.created':
      return { label: `Hallazgo: ${event.payload.title}`, tone: 'warning' };
    case 'patch.proposed':
      return { label: `Parche propuesto (${event.payload.author})`, tone: 'neutral' };
    case 'verification.result':
      return {
        label: `Verificación ${event.payload.verifier}: ${event.payload.passed ? 'ok' : 'falla'}`,
        tone: event.payload.passed ? 'ok' : 'error',
      };
  }
}

function toItem(event: ConsoleEvent): TimelineItem {
  const base = { seq: event.seq, ts: event.ts, type: event.type };
  if (!isKnownEvent(event)) {
    return { ...base, label: `${event.type} (tipo desconocido)`, tone: 'neutral', known: false };
  }
  return { ...base, ...describe(event), known: true };
}

/**
 * Events grouped by agent (orchestrator first, then in order of appearance). `types` limits
 * which events are shown; unknown event types are always representable.
 */
export function buildTimeline(
  events: readonly ConsoleEvent[],
  types?: ReadonlySet<string>,
): Timeline {
  const lanes = new Map<string, { role: string; items: TimelineItem[] }>();
  lanes.set('orchestrator', { role: 'orchestrator', items: [] });
  for (const event of events) {
    const lane = lanes.get(event.actor.agentId) ?? { role: event.actor.role, items: [] };
    lanes.set(event.actor.agentId, lane);
    if (types === undefined || types.has(event.type)) lane.items.push(toItem(event));
  }
  const present = new Set(events.map((event) => event.actor.agentId));
  return {
    lanes: [...lanes.entries()]
      .filter(([agentId]) => present.has(agentId))
      .map(([agentId, lane]) => ({ agentId, role: lane.role, items: lane.items })),
    types: [...new Set(events.map((event) => event.type))].sort(),
  };
}
