import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFENSES,
  LAUNCH_DAY_REPORT,
  LOCKOUT_ALTERNATIVES,
  REPORT_NAMES,
  reportRow,
  TRADEOFF_REPORT,
} from './tradeoff-data';

const repo = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

describe('Launch Day defenses', () => {
  const report = read(LAUNCH_DAY_REPORT);

  it.each(DEFENSES.map((d) => [d.id, d] as const))('%s matches its run table', (_, d) => {
    expect(report).toContain(`Run \`${d.run}\``);
    expect(report).toContain(reportRow('A', d.a));
    expect(report).toContain(reportRow('B', d.b));
  });

  it('keeps every interval around its rate', () => {
    for (const d of DEFENSES) {
      for (const row of [d.a, d.b]) {
        for (const rate of [row.success, row.blocked, row.attack]) {
          expect(rate.lo).toBeLessThanOrEqual(rate.p);
          expect(rate.hi).toBeGreaterThanOrEqual(rate.p);
        }
      }
    }
  });
});

describe('alternatives to the account lockout', () => {
  const report = read(TRADEOFF_REPORT);

  it.each(LOCKOUT_ALTERNATIVES.map((a) => [a.name, a] as const))(
    '%s is quoted from the report',
    (_, a) => {
      expect(report).toContain(`### ${REPORT_NAMES[a.name]}`);
      expect(report).toContain(a.note);
      if (a.success) {
        expect(report).toContain(
          `success A ${a.success.before}/${a.success.of}, B ${a.success.after}/${a.success.of}`,
        );
      }
      if (a.p95) {
        expect(report).toContain(
          `p95 ${a.p95.before} → ${a.p95.after} ms (budget ${a.p95.budget} ms)`,
        );
      }
    },
  );

  it('recommends what the report recommends', () => {
    expect(report).toContain('**Recommendation:** free fix closes the attack');
    expect(
      LOCKOUT_ALTERNATIVES.filter((a) => a.recommended).map((a) => REPORT_NAMES[a.name]),
    ).toEqual(['free fix']);
  });
});
