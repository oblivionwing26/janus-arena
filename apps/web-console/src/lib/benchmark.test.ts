import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseBenchmark } from './benchmark';
import committed from './benchmark.data.json';

const report = readFileSync(
  new URL('../../../../docs/reports/benchmark-juice-shop.md', import.meta.url),
  'utf8',
);

describe('parseBenchmark on the Juice Shop report', () => {
  const b = parseBenchmark(report);

  it('matches the committed data the page loads (UPDATE_BENCHMARK=1 rewrites it)', () => {
    if (process.env.UPDATE_BENCHMARK === '1') {
      writeFileSync(
        new URL('./benchmark.data.json', import.meta.url),
        `${JSON.stringify(b, null, 2)}\n`,
      );
    }
    expect(b).toEqual(committed);
  });

  it('reads the three rounds with their recall and interval', () => {
    expect(b.target).toBe('juice-shop');
    expect(b.rounds).toHaveLength(3);
    expect(b.rounds[0]).toMatchObject({
      round: 1,
      solved: 6,
      total: 60,
      recall: 10,
      lo: 4.7,
      hi: 20.1,
      withoutSideEffects: 5,
      reference: '5/5',
      findings: 6,
      seconds: 21,
    });
    expect(b.controlRun).toBe('01M7A2V6EBKQ1FCZ58C6ZM20GJ');
  });

  it('reads every challenge, and the categories add up to them', () => {
    expect(b.challenges).toHaveLength(60);
    for (const c of b.categories) {
      const inCat = b.challenges.filter((x) => x.category === c.name);
      expect(inCat).toHaveLength(c.challenges);
      expect(inCat.filter((x) => x.solvedRounds === x.rounds).length).toBe(c.everyRound);
    }
    expect(b.challenges.filter((c) => c.solvedRounds > 0)).toHaveLength(6);
  });

  it('marks the side effect and counts stars', () => {
    const rr = b.challenges.find((c) => c.name === 'Repetitive Registration');
    expect(rr?.sideEffect).toBe(true);
    expect(b.challenges.find((c) => c.name === 'SSRF')?.difficulty).toBe(6);
    expect(b.reference.map((r) => r.name)).toContain('Login Admin');
  });
});
