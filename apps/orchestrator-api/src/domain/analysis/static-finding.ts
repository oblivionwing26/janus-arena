/** Severity scale shared by every tool once normalised (finding.created uses the same one). */
export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type StaticTool = 'semgrep' | 'gitleaks' | 'osv-scanner' | 'dependency-cruiser';

/**
 * What a static analysis tool reports, in one shape whatever the tool (F2.5). A suspicion, never
 * a confirmed vulnerability: confirming takes a reproducible PoC (F3). The snippet is at most 5
 * lines, and never holds a secret's value.
 */
export interface StaticFinding {
  readonly kind: 'static';
  readonly tool: StaticTool;
  /** The tool's rule id, e.g. `janus.angular-bypass-security-trust` or `GHSA-xxxx`. */
  readonly rule: string;
  readonly severity: FindingSeverity;
  readonly message: string;
  /** Path from the repository root; for dependencies, the lockfile. */
  readonly file: string;
  /** 1-based; 0 when the finding has no line (a vulnerable package). */
  readonly line: number;
  readonly snippet: string;
}

export const MAX_SNIPPET_LINES = 5;

/** Keeps at most MAX_SNIPPET_LINES lines and 600 characters of a code excerpt. */
export function clipSnippet(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .slice(0, MAX_SNIPPET_LINES)
    .join('\n')
    .slice(0, 600)
    .trimEnd();
}
