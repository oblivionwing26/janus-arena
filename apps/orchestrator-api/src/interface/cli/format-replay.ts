import { abSummary, type AbSummary } from '@janus/stats';
import { isKnownEvent, type RunCompletedEvent } from '@janus/shared-kernel';

import type { ReplayRun } from './replay-input.js';

const DETAIL_WIDTH = 80;

function detail(payload: unknown): string {
  const json = JSON.stringify(payload);
  return json.length > DETAIL_WIDTH ? `${json.slice(0, DETAIL_WIDTH - 1)}…` : json;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** Plain-text replay of a recorded run: a summary, then one line per event in seq order. */
export function formatReplay(run: ReplayRun): string {
  const events = [...run.events].sort((a, b) => a.seq - b.seq);
  const start = Date.parse(events[0]?.ts ?? '');
  const offset = (ts: string) => ((Date.parse(ts) - start) / 1000).toFixed(1);

  const completed = events.findLast(
    (event): event is RunCompletedEvent => isKnownEvent(event) && event.type === 'run.completed',
  );
  const outcome =
    completed !== undefined
      ? `${completed.payload.outcome}${completed.payload.reason === undefined ? '' : ` (${completed.payload.reason})`}`
      : 'not completed';
  const last = events.at(-1);
  const duration = last === undefined ? '0.0' : offset(last.ts);
  const agents = [...new Set(events.map((event) => event.actor.agentId))];

  const llmCalls = events.filter((event) => event.type === 'llm.call').length;
  let tokens = 0;
  let cacheRead = 0;
  let eur = 0;
  for (const event of events) {
    if (event.cost === undefined) continue;
    tokens += event.cost.inputTokens + event.cost.outputTokens;
    cacheRead += event.cost.cacheReadInputTokens;
    eur += event.cost.estimatedEur;
  }
  const unknown = [...new Set(events.filter((e) => !isKnownEvent(e)).map((e) => e.type))];

  const agentWidth = Math.max(5, ...agents.map((agent) => agent.length));
  const typeWidth = Math.max(4, ...events.map((event) => event.type.length + 10));
  const rows = events.map((event) =>
    [
      String(event.seq).padStart(4),
      offset(event.ts).padStart(7),
      event.actor.agentId.padEnd(agentWidth),
      (isKnownEvent(event) ? event.type : `${event.type} (unknown)`).padEnd(typeWidth),
      detail(event.payload),
    ].join('  '),
  );

  return [
    `Run ${run.runId} · ${plural(events.length, 'event')} · source: ${run.source}`,
    `Outcome: ${outcome} · duration ${duration} s · agents: ${agents.join(', ')}`,
    `LLM: ${plural(llmCalls, 'call')} · ${String(tokens)} tokens (${String(cacheRead)} cache read) · ${eur.toFixed(4)} EUR`,
    ...(unknown.length === 0 ? [] : [`Unknown event types (kept as is): ${unknown.join(', ')}`]),
    ...abLines(abSummary(events)),
    '',
    [
      'seq'.padStart(4),
      't(s)'.padStart(7),
      'agent'.padEnd(agentWidth),
      'type'.padEnd(typeWidth),
      'payload',
    ].join('  '),
    ...rows,
  ].join('\n');
}

const pct = (value: number) => `${(value * 100).toFixed(1)} %`;
const pp = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`;
const VERDICTS = {
  'no-detectable-difference': 'no detectable difference',
  'b-higher': 'B higher than A',
  'b-lower': 'B lower than A',
} as const;

/** The F1.8 statistics of a run with sessions, in words: never a conversion claim. */
function abLines(summary: AbSummary): string[] {
  if (summary.variants.length === 0) return [];
  const lines = ['Synthetic task success (95 % intervals):'];
  for (const { variant, personas, baseline } of summary.variants) {
    const rate =
      personas === null
        ? 'no personas'
        : `${String(personas.successes)}/${String(personas.n)} personas = ${pct(personas.rate)} [${pct(personas.low)}, ${pct(personas.high)}]`;
    lines.push(
      `  ${variant.toUpperCase()}: ${rate} · baseline ${String(baseline.successes)}/${String(baseline.n)}`,
    );
  }
  const { comparison } = summary;
  if (comparison !== null) {
    const { a, b, pairs, difference, verdict } = comparison;
    lines.push(
      difference === null || verdict === null
        ? `  ${b.toUpperCase()} − ${a.toUpperCase()}: no complete pairs`
        : `  ${b.toUpperCase()} − ${a.toUpperCase()} over ${String(pairs)} pairs: ${pp(difference.mean)} pp [${pp(difference.low)}, ${pp(difference.high)}] (bootstrap ${String(difference.resamples)}, seed ${String(difference.seed)}) → ${VERDICTS[verdict]}`,
    );
  }
  for (const { agentId, reason } of summary.excluded)
    lines.push(`  excluded ${agentId}: ${reason}`);
  return lines;
}
