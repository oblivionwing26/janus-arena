// Phase 9 of the launch page, "inside the console": every recorded run of the demo as a card on a
// board, its column decided by what its events say it was. Pure: events in, cards out.

import type { RunEvent } from './attack-tree';

export type Column = 'gate' | 'synthlab' | 'launch-day' | 'variant' | 'red-team' | 'blue-team';

export const COLUMNS: readonly { id: Column; label: string }[] = [
  { id: 'gate', label: 'Gates' },
  { id: 'synthlab', label: 'SynthLab' },
  { id: 'launch-day', label: 'Launch Day' },
  { id: 'variant', label: 'Variant & audit' },
  { id: 'red-team', label: 'Red Team' },
  { id: 'blue-team', label: 'Blue Team' },
];

export interface BoardCard {
  runId: string;
  column: Column;
  title: string;
  line: string;
  outcome: 'success' | 'error' | 'unknown';
  events: number;
  startedAt: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (events: readonly RunEvent[], type: string) =>
  events.filter((e) => e.type === type).length;

const TARGETS: Record<string, string> = { 'juice-shop': 'Juice Shop', shoplab: 'ShopLab' };

export function columnOf(events: readonly RunEvent[]): Column {
  const has = (type: string) => events.some((e) => e.type === type);
  if (has('gate.stage')) return 'gate';
  if (has('attack.attempt') && has('finding.created')) return 'red-team';
  if (
    has('finding.remediated') ||
    events.some((e) => e.type === 'patch.proposed' && e.payload.author === 'blue-team')
  ) {
    return 'blue-team';
  }
  if (
    has('audit.completed') ||
    events.some((e) => e.type === 'patch.proposed' && e.payload.author === 'ui-engineer')
  ) {
    return 'variant';
  }
  if (events.some((e) => e.type === 'session.started' && e.payload.kind === 'saboteur'))
    return 'launch-day';
  return 'synthlab';
}

export function buildCard(
  runId: string,
  events: readonly RunEvent[],
  startedAt: string,
): BoardCard {
  const column = columnOf(events);
  const started = events.find((e) => e.type === 'run.started')?.payload;
  const completed = events.find((e) => e.type === 'run.completed')?.payload;
  const targetId =
    str(started?.target) ??
    str(events.find((e) => e.type === 'scope.verified')?.payload.target) ??
    'shoplab';
  const target = TARGETS[targetId] ?? targetId;
  const outcome =
    completed?.outcome === 'success'
      ? 'success'
      : completed?.outcome === 'error'
        ? 'error'
        : 'unknown';
  const variants = Array.isArray(started?.variants) ? started.variants.length : 1;
  const sessions = events.filter((e) => e.type === 'session.started');
  const passed = events.filter(
    (e) => e.type === 'task.verified' && e.payload.status === 'passed',
  ).length;

  let title = target;
  let line = '';
  switch (column) {
    case 'gate': {
      const stages = new Set(
        events.filter((e) => e.type === 'gate.stage').map((e) => str(e.payload.stage)),
      );
      title = `The gate on ${target}`;
      line = `${stages.size} stages, each with its own event log`;
      break;
    }
    case 'red-team':
      title = `Attacks on ${target}`;
      line = `${count(events, 'finding.confirmed')} confirmed · ${count(events, 'attack.attempt')} requests · ${count(events, 'scope.blocked')} stopped by scope`;
      break;
    case 'blue-team': {
      const passedChecks = events.filter(
        (e) => e.type === 'verification.result' && e.payload.passed === true,
      ).length;
      const fixed = events.find((e) => e.type === 'finding.remediated')?.payload;
      title = `A fix on ${target}`;
      line = fixed
        ? `fixed in ${String(fixed.iterations)} iteration · ${passedChecks} checks passed`
        : `${passedChecks} checks passed`;
      break;
    }
    case 'variant': {
      const audit = events.find((e) => e.type === 'audit.completed')?.payload;
      if (audit) {
        const introduced = audit.introduced as Record<string, number> | undefined;
        title = `Differential audit · ${target}`;
        line = `B introduces ${introduced?.findings ?? 0} findings and ${introduced?.endpoints ?? 0} endpoints`;
      } else {
        title = `Variant B · ${target}`;
        line = `${count(events, 'patch.proposed')} patches · ${events.filter((e) => e.type === 'verification.result' && e.payload.passed === true).length} checks passed`;
      }
      break;
    }
    case 'launch-day': {
      const saboteurs = sessions.filter((e) => e.payload.kind === 'saboteur').length;
      title = `Launch Day · ${target}`;
      line = `${sessions.length - saboteurs} shopper sessions · ${saboteurs} saboteurs`;
      break;
    }
    default:
      title = `${variants > 1 ? 'Paired A/B' : 'Synthetic shoppers'} · ${target}`;
      line = `${passed}/${sessions.length} sessions bought · ${count(events, 'friction.signal')} friction signals`;
  }

  return { runId, column, title, line, outcome, events: events.length, startedAt };
}
