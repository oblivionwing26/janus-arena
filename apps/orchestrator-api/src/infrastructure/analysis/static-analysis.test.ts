// F2.5: every tool's real JSON output (captured from the pinned images on the sample repo in
// fixtures/static-analysis) normalises to StaticFinding. No Docker needed here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clipSnippet, type StaticFinding } from '../../domain/analysis/static-finding.js';
import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import { describeStaticAnalysisContract } from '../../test-support/static-analysis-contract.js';
import { parseDepcruise } from './depcruise-analysis.js';
import { parseGitleaks, REDACTED } from './gitleaks-analysis.js';
import { parseOsv } from './osv-analysis.js';
import { parseSemgrep } from './semgrep-analysis.js';

const dir = fileURLToPath(new URL('../../../fixtures/static-analysis/', import.meta.url));
const repo = `${dir}sample-repo`;
const output = (tool: string) => readFileSync(`${dir}${tool}-output.json`, 'utf8');
// The synthetic key planted in sample-repo/src/settings.ts.
const SECRET = 'q8Zr2XvT9mLw4KpB7nYc3HsD6fJu1GaE';

describe('parseSemgrep', () => {
  it('keeps the rule id, maps severity and reads the snippet from the workspace', async () => {
    const findings = await parseSemgrep(output('semgrep'), repo);

    expect(findings).toEqual([
      {
        kind: 'static',
        tool: 'semgrep',
        rule: 'janus.quantity-upper-bound-only',
        severity: 'high',
        message: expect.stringContaining(
          'quantity is checked only against an upper bound',
        ) as string,
        file: 'src/basket.ts',
        line: 7,
        snippet: '  if (stock.quantity >= quantity) {',
      },
      expect.objectContaining({
        rule: 'janus.angular-bypass-security-trust',
        file: 'src/search.ts',
        line: 3,
        snippet: '  return sanitizer.bypassSecurityTrustHtml(query);',
      }),
    ]);
  });
});

describe('parseGitleaks', () => {
  it('never lets the secret value out: the snippet shows it redacted', async () => {
    const findings = await parseGitleaks(output('gitleaks'), repo);

    expect(findings).toEqual([
      {
        kind: 'static',
        tool: 'gitleaks',
        rule: 'generic-api-key',
        severity: 'high',
        message: expect.stringContaining('Generic API Key') as string,
        file: 'src/settings.ts',
        line: 3,
        snippet: `export const paymentApiKey = '${REDACTED}';`,
      },
    ]);
    expect(JSON.stringify(findings)).not.toContain(SECRET);
  });

  it('reads an empty report as no findings', async () => {
    expect(await parseGitleaks('', repo)).toEqual([]);
    expect(await parseGitleaks('[]', repo)).toEqual([]);
  });
});

describe('parseOsv', () => {
  it('reports each advisory group of a vulnerable package once, at the lockfile', () => {
    const findings = parseOsv(output('osv'));

    expect(findings.length).toBeGreaterThan(0);
    expect(new Set(findings.map((finding) => finding.rule)).size).toBe(findings.length);
    expect(findings[0]).toMatchObject({
      tool: 'osv-scanner',
      file: 'package-lock.json',
      line: 0,
      snippet: 'lodash@4.17.15',
    });
    expect(findings.some((finding) => finding.severity === 'high')).toBe(true);
  });
});

describe('parseDepcruise', () => {
  it('reports a violation at the importing file, with the rule comment', () => {
    expect(
      parseDepcruise(
        [
          {
            from: 'src/components/cart.tsx',
            to: 'src/lib/db.ts',
            rule: { name: 'components-not-database', severity: 'error' },
          },
        ],
        { 'components-not-database': 'UI components never import the database client.' },
      ),
    ).toEqual([
      {
        kind: 'static',
        tool: 'dependency-cruiser',
        rule: 'components-not-database',
        severity: 'medium',
        message:
          'UI components never import the database client. (src/components/cart.tsx → src/lib/db.ts)',
        file: 'src/components/cart.tsx',
        line: 0,
        snippet: 'src/components/cart.tsx → src/lib/db.ts',
      },
    ]);
  });
});

describe('clipSnippet', () => {
  it('keeps at most 5 lines', () => {
    expect(clipSnippet('1\n2\n3\n4\n5\n6\n7').split('\n')).toHaveLength(5);
  });
});

/** A fake tool that reports the findings it was given. */
class ScriptedStaticAnalysis implements StaticAnalysisPort {
  constructor(private readonly findings: readonly StaticFinding[]) {}

  run(): Promise<StaticFinding[]> {
    return Promise.resolve([...this.findings]);
  }
}

describeStaticAnalysisContract('ScriptedStaticAnalysis', {
  create: async () => ({
    analysis: new ScriptedStaticAnalysis(await parseSemgrep(output('semgrep'), repo)),
    workspace: { id: 'sample', path: repo, url: 'file:///sample', baseSha: '' },
  }),
  neverReported: [SECRET],
});
