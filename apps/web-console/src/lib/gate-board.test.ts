import { readFileSync, writeFileSync } from 'node:fs';

import { parseRunExport } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import committed from './gate-board.data.json';
import { formatDuration, formatEur, readGate } from './gate-board';

const SHOPLAB_GATE = '01M796CT3J5XRRXAREPJ88M525';
const JUICE_GATE = '01M79YYR766FTNCYF5STGZ3ANY';

const gate = (runId: string) => {
  const text = readFileSync(
    new URL(`../../public/demo/runs/${runId}.json`, import.meta.url),
    'utf8',
  );
  return readGate(runId, parseRunExport(text).events);
};

describe('readGate on the two recorded gates', () => {
  const shoplab = gate(SHOPLAB_GATE);
  const juice = gate(JUICE_GATE);

  it('matches the committed data the page loads (UPDATE_GATE_BOARD=1 rewrites it)', () => {
    const data = { shoplab, juice };
    if (process.env.UPDATE_GATE_BOARD === '1') {
      writeFileSync(
        new URL('./gate-board.data.json', import.meta.url),
        `${JSON.stringify(data, null, 2)}\n`,
      );
    }
    expect(data).toEqual(committed);
  });

  it('reads all eight stages of each gate, in order', () => {
    const order = [
      'synthlab-a',
      'variant-b',
      'ab',
      'audit',
      'red-team',
      'blue-team',
      'report',
      'pr',
    ];
    expect(shoplab.stages.map((s) => s.stage)).toEqual(order);
    expect(juice.stages.map((s) => s.stage)).toEqual(order);
  });

  it('times and costs the ShopLab gate as its log says', () => {
    expect(shoplab.target).toBe('shoplab');
    expect(shoplab.budgetEur).toBe(1.2);
    expect(shoplab.seconds).toBe(1312); // 00:54:49.202 → 01:16:40.787, 1311.6 s
    const a = shoplab.stages[0];
    expect(a).toMatchObject({ status: 'completed', at: 0, seconds: 415, allowanceEur: 0.36 });
    expect(a?.spentEur).toBeCloseTo(0.2115, 4);
    expect(a?.runIds).toEqual(['01M796CT6SAG1KM8Y2YEKA027R']);
    expect(shoplab.stages[3]).toMatchObject({ stage: 'audit', status: 'completed', spentEur: 0 });
    expect(shoplab.stages[4]?.status).toBe('skipped');
    expect(shoplab.stages[4]?.reason).toMatch(/allows only browse, http-probe/);
    expect(shoplab.stages[7]?.pr).toEqual({
      url: 'https://github.com/oblivionwing26/janus-shoplab/pull/5',
      number: 5,
    });
  });

  it('times the Juice Shop gate, with both Blue Team runs and the skipped UX stages', () => {
    expect(juice.seconds).toBe(1723); // 08:04:02.918 → 08:32:46.254
    expect(juice.stages[1]).toMatchObject({ stage: 'variant-b', status: 'skipped', seconds: 0 });
    expect(juice.stages[4]).toMatchObject({ stage: 'red-team', status: 'completed', seconds: 66 });
    expect(juice.stages[5]?.runIds).toEqual([
      '01M79ZC3PHE7YQA5EQR02YHTBC',
      '01M79ZT16FG1W3EAX2WJNJRQD4',
    ]);
    expect(juice.stages[7]).toMatchObject({ stage: 'pr', status: 'skipped', pr: null });
    expect(juice.spentEur).toBeCloseTo(0.82, 2);
  });
});

describe('formatting', () => {
  it('reads durations and euros', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(13)).toBe('13 s');
    expect(formatDuration(415)).toBe('6 min 55 s');
    expect(formatEur(0)).toBe('0 €');
    expect(formatEur(0.004)).toBe('< 0.01 €');
    expect(formatEur(0.2115)).toBe('0.21 €');
  });
});
