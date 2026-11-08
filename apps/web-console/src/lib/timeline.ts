import { isKnownEvent, type JanusEvent, type SessionEndedEvent } from '@janus/shared-kernel';

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

const SESSION_OUTCOMES: Record<SessionEndedEvent['payload']['outcome'], string> = {
  success: 'objetivo conseguido',
  abandon: 'abandona',
  patience_exhausted: 'se le acaba la paciencia',
  budget_exhausted: 'presupuesto agotado',
};

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
      const { outcome, reason, sessions } = event.payload;
      const counts =
        sessions === undefined
          ? ''
          : ` · sesiones ${String(sessions.completed)}/${String(sessions.total)} completas` +
            (sessions.excluded === 0
              ? ''
              : ` · ${String(sessions.excluded)} excluida${sessions.excluded === 1 ? '' : 's'} (infraestructura)`);
      return {
        label: `Fin · ${outcome}${reason === undefined ? '' : ` (${reason})`}${counts}`,
        tone: outcome === 'success' ? 'ok' : 'error',
      };
    }
    case 'task.verified': {
      const { taskId, status, checks } = event.payload;
      const failed = checks.filter((check) => !check.passed).map((check) => check.check);
      const text = { passed: 'cumplida', failed: 'no cumplida', unverifiable: 'sin verificar' }[
        status
      ];
      return {
        label: `Tarea ${taskId}: ${text}${failed.length === 0 ? '' : ` (${failed.join('; ')})`}`,
        tone: status === 'passed' ? 'ok' : status === 'failed' ? 'error' : 'warning',
      };
    }
    case 'session.started': {
      const { variant, kind, persona, seed, attempt, task } = event.payload;
      const who = kind === 'scripted' ? 'agente programado' : (persona ?? kind);
      const retry = attempt > 1 ? ` · intento ${String(attempt)}` : '';
      const playing = task === undefined ? '' : ` · tarea ${task}`;
      return {
        label: `Sesión ${kind === 'baseline' ? 'baseline ' : ''}${who} · variante ${variant.toUpperCase()} · semilla ${String(seed)}${playing}${retry}`,
        tone: 'neutral',
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
    case 'page.error': {
      const { kind, status, message } = event.payload;
      const what = kind === 'http' ? `HTTP ${String(status ?? '')}`.trim() : kind;
      return { label: `Error técnico (${what}): ${message}`, tone: 'error' };
    }
    case 'page.vitals': {
      const { lcpMs, cls, inpMs } = event.payload;
      const parts = [
        lcpMs === undefined ? undefined : `LCP ${String(Math.round(lcpMs))} ms`,
        cls === undefined ? undefined : `CLS ${cls.toFixed(2)}`,
        inpMs === undefined ? undefined : `INP ${String(Math.round(inpMs))} ms`,
      ].filter(Boolean);
      return { label: `Vitals: ${parts.join(' · ') || 'sin medidas'}`, tone: 'neutral' };
    }
    case 'page.screenshot':
      return {
        label: `Captura por ${event.payload.detector}: ${event.payload.artifact}`,
        tone: 'warning',
      };
    case 'agent.thought':
      return { label: `Pensamiento: «${event.payload.text}»`, tone: 'neutral' };
    case 'session.ended': {
      const { outcome, reason } = event.payload;
      return {
        label: `Sesión: ${SESSION_OUTCOMES[outcome]}${reason === undefined ? '' : ` (${reason})`}`,
        tone: outcome === 'success' ? 'ok' : outcome === 'budget_exhausted' ? 'error' : 'warning',
      };
    }
    case 'scope.verified': {
      const { target, origins } = event.payload;
      return {
        label: `Propiedad de ${target} verificada en ${origins.join(', ')}`,
        tone: 'neutral',
      };
    }
    case 'scope.blocked': {
      const { method, origin, path, testType, reason } = event.payload;
      return {
        label: `Bloqueada por el alcance (${reason}, ${testType}): ${method} ${origin}${path}`,
        tone: 'warning',
      };
    }
    case 'surface.mapped': {
      const { side, ref, endpoints } = event.payload;
      const leads = endpoints.filter((e) => e.auth && e.ownerCheck === false).length;
      return {
        label: `Superficie de ${side === 'base' ? 'A' : 'B'} (${ref}): ${String(endpoints.length)} endpoints, ${String(leads)} pistas de IDOR`,
        tone: leads > 0 ? 'warning' : 'neutral',
      };
    }
    case 'audit.completed': {
      const { introduced, blocked } = event.payload;
      return {
        label: `Auditoría diferencial: ${blocked ? 'B bloqueada' : 'B pasa'} (${String(introduced.findings)} hallazgos y ${String(introduced.endpoints)} endpoints nuevos; ${String(introduced.high + introduced.critical)} altos o críticos)`,
        tone: blocked ? 'error' : 'ok',
      };
    }
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
