import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { StaticAnalysisPort } from '../domain/analysis/static-analysis-port.js';
import type { StaticFinding } from '../domain/analysis/static-finding.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { RunStaticAnalysis } from './run-static-analysis.js';

const RUN_ID = '01JC0F25ST0000000000000AAA';
const WORKSPACE = { id: 'w', path: '/w', url: 'file:///w', baseSha: '' };

const finding = (overrides: Partial<StaticFinding>): StaticFinding => ({
  kind: 'static',
  tool: 'semgrep',
  rule: 'janus.dom-inner-html',
  severity: 'medium',
  message: 'x',
  file: 'src/a.ts',
  line: 3,
  snippet: 'x',
  ...overrides,
});

const tool = (findings: StaticFinding[]): StaticAnalysisPort => ({
  run: () => Promise.resolve(findings),
});

describe('RunStaticAnalysis', () => {
  it('runs every tool, sorts by severity and records each finding as suspected', async () => {
    const store = new InMemoryEventStore();

    const findings = await new RunStaticAnalysis({
      store,
      tools: [
        tool([
          finding({ severity: 'low', rule: 'no-circular', tool: 'dependency-cruiser', line: 0 }),
        ]),
        tool([
          finding({ severity: 'high', rule: 'janus.angular-bypass-security-trust', line: 146 }),
          finding({
            severity: 'critical',
            tool: 'osv-scanner',
            rule: 'GHSA-1',
            file: 'package-lock.json',
            line: 0,
          }),
        ]),
      ],
    }).execute({ runId: RUN_ID, workspace: WORKSPACE });

    expect(findings.map((found) => found.severity)).toEqual(['critical', 'high', 'low']);
    const created = (await store.readRun(RUN_ID))
      .filter(isKnownEvent)
      .flatMap((event) => (event.type === 'finding.created' ? [event.payload] : []));
    expect(created.map(({ title, status, kind }) => [title, status, kind])).toEqual([
      ['osv-scanner: GHSA-1 at package-lock.json', 'suspected', 'static'],
      ['semgrep: janus.angular-bypass-security-trust at src/a.ts:146', 'suspected', 'static'],
      ['dependency-cruiser: no-circular at src/a.ts', 'suspected', 'static'],
    ]);
  });
});
