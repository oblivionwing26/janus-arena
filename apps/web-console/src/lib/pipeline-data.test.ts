import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  JUICE_FINDINGS,
  JUICE_SYNTHLAB_A,
  JUICE_VERIFIERS,
  PERSONAS,
  SHOPLAB_AUDIT,
  SHOPLAB_AUDIT_RESULT,
  SHOPLAB_GATE_AB,
  SHOPLAB_PATCHES,
} from './pipeline-data';

const repo = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

describe('pipeline station data', () => {
  it.each(PERSONAS.map((p) => [p.name, p] as const))('persona %s matches its file', (name, p) => {
    const text = read(p.source);
    expect(text).toContain(`name: ${name}`);
    expect(text).toContain(p.evidence);
    expect(text).toContain(`device: ${p.device}`);
  });

  it.each([JUICE_SYNTHLAB_A, SHOPLAB_GATE_AB, SHOPLAB_AUDIT, JUICE_FINDINGS, JUICE_VERIFIERS])(
    'evidence "$evidence" is in $source',
    ({ source, evidence }) => {
      expect(read(source)).toContain(evidence);
    },
  );

  it('every finding and verifier detail is quoted from the Juice Shop gate report', () => {
    const text = read(JUICE_FINDINGS.source);
    for (const f of JUICE_FINDINGS.value) {
      expect(text).toContain(f.where);
      expect(text).toContain(f.oracle);
    }
    for (const v of JUICE_VERIFIERS.value) {
      expect(text).toContain(`| ${v.name} | passed |`);
      expect(text).toContain(v.detail);
    }
  });

  it('the variant patches and their checks are the recorded ones', () => {
    const run = JSON.parse(read(SHOPLAB_PATCHES.source)) as {
      events: { type: string; payload: Record<string, unknown> }[];
    };
    const summaries = run.events
      .filter((e) => e.type === 'patch.proposed')
      .map((e) => String(e.payload.summary));
    const checks = run.events
      .filter((e) => e.type === 'verification.result')
      .map((e) => String(e.payload.details));
    expect(summaries.some((s) => s.includes('Otras opciones') && s.includes('cart'))).toBe(true);
    expect(summaries.some((s) => s.includes('order summary') && s.includes('checkout'))).toBe(true);
    for (const p of SHOPLAB_PATCHES.value) expect(checks).toContain(p.checks);
  });

  it('the audit result is the recorded one', () => {
    const run = JSON.parse(read(SHOPLAB_AUDIT_RESULT.source)) as {
      events: { type: string; payload: Record<string, unknown> }[];
    };
    const audit = run.events.find((e) => e.type === 'audit.completed');
    expect(audit?.payload.introduced).toEqual({
      findings: SHOPLAB_AUDIT_RESULT.value.findings,
      endpoints: SHOPLAB_AUDIT_RESULT.value.endpoints,
      high: SHOPLAB_AUDIT_RESULT.value.high,
      critical: SHOPLAB_AUDIT_RESULT.value.critical,
    });
    expect(audit?.payload.blocked).toBe(SHOPLAB_AUDIT_RESULT.value.blocked);
  });
});
