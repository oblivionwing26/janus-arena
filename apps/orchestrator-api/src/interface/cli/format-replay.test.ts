import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseEvent, parseRunExport } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { formatReplay } from './format-replay.js';

const RUN_ID = '01JC0F12RVN00000000000000A';

function event(seq: number, seconds: number, type: string, payload: unknown, extra = {}) {
  return parseEvent({
    id: `01JC0F12RVN000000000000${String(seq).padStart(3, '0')}`,
    runId: RUN_ID,
    seq,
    ts: new Date(Date.UTC(2026, 10, 6, 0, 0, 0) + seconds * 1000).toISOString(),
    schemaVersion: 1,
    actor:
      seq === 0 || type.startsWith('run.')
        ? { agentId: 'orchestrator', role: 'orchestrator' }
        : { agentId: 'persona-ana-1', role: 'navigator' },
    type,
    payload,
    ...extra,
  });
}

const events = [
  event(0, 0, 'run.started', { budget: { maxTokens: 100_000, maxEur: 1 } }),
  event(
    1,
    2.5,
    'llm.call',
    { role: 'navigator', model: 'claude-haiku-5-5', durationMs: 700 },
    {
      cost: {
        inputTokens: 1000,
        outputTokens: 50,
        cacheReadInputTokens: 400,
        cacheCreationInputTokens: 100,
        estimatedEur: 0.0025,
      },
    },
  ),
  event(2, 3, 'replay.bookmarked', { note: 'from the future' }),
  event(3, 12.25, 'run.completed', { outcome: 'success' }),
];

describe('formatReplay', () => {
  const text = formatReplay({ runId: RUN_ID, source: 'file', events });
  const lines = text.split('\n');

  it('summarises the run: outcome, duration, agents and LLM cost', () => {
    expect(lines.slice(0, 4)).toEqual([
      `Run ${RUN_ID} · 4 events · source: file`,
      'Outcome: success · duration 12.3 s · agents: orchestrator, persona-ana-1',
      'LLM: 1 call · 1050 tokens (400 cache read) · 0.0025 EUR',
      'Unknown event types (kept as is): replay.bookmarked',
    ]);
  });

  it('prints one line per event in seq order with its offset from the start', () => {
    const rows = lines.filter((line) => /^\s*\d+ +\d/.test(line));

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatch(/^ {3}0 +0\.0 +orchestrator +run\.started +\{"budget"/);
    expect(rows[2]).toMatch(/replay\.bookmarked \(unknown\)/);
    expect(rows[3]).toMatch(/^ {3}3 +12\.3 +orchestrator +run\.completed/);
  });

  it('says when the run has not completed', () => {
    const open = formatReplay({ runId: RUN_ID, source: 'database', events: events.slice(0, 2) });

    expect(open.split('\n')[1]).toMatch(/^Outcome: not completed/);
  });
});

describe('formatReplay with A/B sessions (F1.8)', () => {
  it('adds the synthetic task success of each variant and the paired verdict', () => {
    const file = fileURLToPath(
      new URL('../../../../../packages/stats/fixtures/aa-run-f17.json', import.meta.url),
    );
    const { runId, events } = parseRunExport(readFileSync(file, 'utf8'));
    const lines = formatReplay({ runId, source: 'file', events }).split('\n');

    expect(lines.slice(3, 7)).toEqual([
      'Synthetic task success (95 % intervals):',
      '  A: 3/4 personas = 75.0 % [30.1 %, 95.4 %] · baseline 1/1',
      '  B: 3/4 personas = 75.0 % [30.1 %, 95.4 %] · baseline 1/1',
      '  B − A over 4 pairs: +0.0 pp [+0.0, +0.0] (bootstrap 10000, seed 20261106) → no detectable difference',
    ]);
  });
});
