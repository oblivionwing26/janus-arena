import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { RunEvent } from './attack-tree';
import { buildCard, COLUMNS, type BoardCard } from './console-board';
import committed from './console-board.data.json';

const demo = new URL('../../public/demo/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', demo), 'utf8')) as {
  runs: { runId: string; startedAt: string; eventCount: number }[];
};

function build(): BoardCard[] {
  return index.runs.map((r) => {
    const run = JSON.parse(readFileSync(new URL(`runs/${r.runId}.json`, demo), 'utf8')) as {
      events: RunEvent[];
    };
    return buildCard(r.runId, run.events, r.startedAt);
  });
}

describe('the console board from the recorded demo runs', () => {
  const cards = build();

  it('matches the committed board (UPDATE_BOARD=1 rewrites it)', () => {
    if (process.env.UPDATE_BOARD === '1') {
      writeFileSync(
        new URL('./console-board.data.json', import.meta.url),
        `${JSON.stringify(cards, null, 2)}\n`,
      );
    }
    expect(cards).toEqual(committed);
  });

  it('has a card for every recorded run, with its event count', () => {
    expect(cards).toHaveLength(index.runs.length);
    for (const r of index.runs) {
      expect(cards.find((c) => c.runId === r.runId)?.events).toBe(r.eventCount);
    }
  });

  it('puts every column to use', () => {
    for (const col of COLUMNS) {
      expect(cards.some((c) => c.column === col.id)).toBe(true);
    }
  });

  it('reads the Juice Shop attacks and fix from their events', () => {
    const red = cards.find((c) => c.runId === '01M79ZA35SZ9QRNF6K3AAGXNQN');
    expect(red?.column).toBe('red-team');
    expect(red?.line).toBe('6 confirmed · 32 requests · 6 stopped by scope');
    const blue = cards.find((c) => c.runId === '01M79ZC3PHE7YQA5EQR02YHTBC');
    expect(blue?.line).toBe('fixed in 1 iteration · 4 checks passed');
  });
});
