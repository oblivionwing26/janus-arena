import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  arcPosition,
  buildAttackTree,
  cleanText,
  spreadLabels,
  type RunEvent,
} from './attack-tree';

const runs = new URL('../../public/demo/runs/', import.meta.url);
const events = (id: string) =>
  (JSON.parse(readFileSync(new URL(`${id}.json`, runs), 'utf8')) as { events: RunEvent[] }).events;

const RED = '01M79ZA35SZ9QRNF6K3AAGXNQN';
const BLUE = '01M79ZC3PHE7YQA5EQR02YHTBC';

describe('buildAttackTree on the recorded Juice Shop gate', () => {
  const tree = buildAttackTree(events(RED), events(BLUE));

  it('counts what the run recorded', () => {
    expect(tree.target).toBe('juice-shop');
    expect(tree.totals).toEqual({ attempts: 32, confirmed: 6, blocked: 6, mapped: 106 });
  });

  it('groups attempts by attack class, in a fixed order', () => {
    expect(tree.classes.map((c) => c.testType)).toEqual([
      'idor',
      'auth-bypass',
      'xss',
      'business-logic',
      'brute-force',
    ]);
    expect(tree.classes.reduce((n, c) => n + c.attempts, 0)).toBe(32);
  });

  it('marks the six confirmed findings, the fixed one and the scope refusals', () => {
    const leaves = tree.classes.flatMap((c) => c.leaves);
    const by = (state: string) =>
      leaves.filter((l) => l.state === state).map((l) => `${l.testType} ${l.endpoint}`);
    expect(by('fixed')).toEqual(['idor GET /rest/basket/:id']);
    expect(by('exploited').sort()).toEqual(
      [
        'auth-bypass POST /rest/user/login',
        'brute-force POST /rest/user/login',
        'business-logic POST /rest/products/reviews',
        'business-logic PUT /api/BasketItems/:id',
        'xss GET /#/search',
      ].sort(),
    );
    expect(by('blocked')).toEqual(['idor GET /api/Hints/:id']);
    expect(by('refused').sort()).toEqual(
      [
        'auth-bypass POST /api/Users',
        'brute-force POST /api/Users',
        'idor GET /api/Users/:id',
      ].sort(),
    );
  });

  it('keeps the oracle evidence and the fix with its verifiers', () => {
    const basket = tree.classes[0]?.leaves.find((l) => l.endpoint === 'GET /rest/basket/:id');
    expect(basket?.evidence).toContain('received a record of user');
    expect(tree.fix?.iterations).toBe(1);
    expect(tree.fix?.diff).toContain('routes/basket.ts');
    expect(tree.fix?.verifications.map((v) => [v.verifier, v.passed])).toEqual([
      ['build-checks', true],
      ['poc-replay', true],
      ['regression-tests', true],
      ['synthlab-rerun', true],
    ]);
  });

  it('places mapped endpoints on the arc and unmapped client routes at its end', () => {
    expect(arcPosition(tree, 'GET /#/search')).toBe(1);
    const p = arcPosition(tree, 'GET /rest/basket/:id');
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe('helpers', () => {
  it('cleans the replacement character recorded for an apostrophe', () => {
    expect(cleanText('user�s data')).toBe('user’s data');
  });

  it('spreads close labels apart in order and inside the bounds', () => {
    const out = spreadLabels([100, 102, 104, 300], 20, 0, 400);
    expect(out).toEqual([100, 120, 140, 300]);
    const clamped = spreadLabels([390, 395], 20, 0, 400);
    expect(clamped).toEqual([380, 400]);
  });
});
