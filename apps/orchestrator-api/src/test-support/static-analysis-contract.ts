// Shared contract suite for StaticAnalysisPort: a scripted fake in `pnpm test`, and Semgrep,
// gitleaks, osv-scanner and dependency-cruiser on real code in `pnpm test:sandbox`.
// Not part of the build.

import { describe, expect, it } from 'vitest';

import type { StaticAnalysisPort } from '../domain/analysis/static-analysis-port.js';
import { MAX_SNIPPET_LINES } from '../domain/analysis/static-finding.js';
import type { VcsWorkspace } from '../domain/vcs/vcs-port.js';

export interface StaticAnalysisHarness {
  /** A tool and a workspace it reports something on. */
  readonly create: () => Promise<{ analysis: StaticAnalysisPort; workspace: VcsWorkspace }>;
  /** Values that must never appear in a finding (e.g. a planted secret). */
  readonly neverReported?: readonly string[];
}

export function describeStaticAnalysisContract(
  name: string,
  harness: StaticAnalysisHarness,
  timeout = 5_000,
): void {
  describe(`StaticAnalysisPort contract: ${name}`, () => {
    it(
      'reports normalised findings with repository paths and short snippets',
      async () => {
        const { analysis, workspace } = await harness.create();

        const findings = await analysis.run(workspace);

        expect(findings.length).toBeGreaterThan(0);
        for (const finding of findings) {
          expect(finding.kind).toBe('static');
          expect(['info', 'low', 'medium', 'high', 'critical']).toContain(finding.severity);
          expect(finding.rule).not.toBe('');
          expect(finding.file).not.toMatch(/^\/|^[A-Za-z]:|(^|\/)\.\.(\/|$)/);
          expect(finding.line).toBeGreaterThanOrEqual(0);
          expect(finding.snippet.split('\n').length).toBeLessThanOrEqual(MAX_SNIPPET_LINES);
          for (const value of harness.neverReported ?? []) {
            expect(JSON.stringify(finding)).not.toContain(value);
          }
        }
      },
      timeout,
    );
  });
}
