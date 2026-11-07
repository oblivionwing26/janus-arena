import { z } from 'zod';

import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { FindingSeverity, StaticFinding } from '../../domain/analysis/static-finding.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import type { DockerCli } from '../sandbox/docker-cli.js';
import { runInContainer } from './container-tool.js';
import { CONTAINER_ROOT, readSnippet, repoPath } from './source-lines.js';

export const SEMGREP_IMAGE = 'semgrep/semgrep:1.180.0';
const RULES_ROOT = '/rules';

const outputSchema = z.object({
  results: z.array(
    z.object({
      check_id: z.string(),
      path: z.string(),
      start: z.object({ line: z.int() }),
      end: z.object({ line: z.int() }),
      extra: z.object({ message: z.string(), severity: z.string() }),
    }),
  ),
});

const SEVERITY: Readonly<Record<string, FindingSeverity>> = {
  ERROR: 'high',
  WARNING: 'medium',
  INFO: 'low',
};

/** Semgrep's JSON report as findings; the rule id without the folder prefix it adds. */
export async function parseSemgrep(json: string, workspaceRoot: string): Promise<StaticFinding[]> {
  const { results } = outputSchema.parse(JSON.parse(json));
  return Promise.all(
    results.map(async (result) => {
      const file = repoPath(result.path);
      return {
        kind: 'static' as const,
        tool: 'semgrep' as const,
        rule: /(janus\.[\w-]+)$/.exec(result.check_id)?.[1] ?? result.check_id,
        severity: SEVERITY[result.extra.severity] ?? 'medium',
        message: result.extra.message.trim(),
        file,
        line: result.start.line,
        snippet: await readSnippet(workspaceRoot, file, result.start.line, result.end.line),
      };
    }),
  );
}

/**
 * Semgrep (official image, pinned) with Janus's own rules in rules/semgrep, in a container
 * with no network and metrics off (F2.5). Registry rule packs would need network and are not
 * used. Tests, dependencies and vendored challenge fixes are skipped.
 */
export class SemgrepAnalysis implements StaticAnalysisPort {
  constructor(
    private readonly docker: DockerCli,
    private readonly rulesDir: string,
    private readonly image = SEMGREP_IMAGE,
  ) {}

  async run(workspace: VcsWorkspace): Promise<StaticFinding[]> {
    const { stdout } = await runInContainer(this.docker, {
      image: this.image,
      network: 'none',
      copy: [
        { from: this.rulesDir, to: RULES_ROOT },
        { from: workspace.path, to: CONTAINER_ROOT },
      ],
      args: [
        'semgrep',
        'scan',
        '--config',
        RULES_ROOT,
        '--json',
        '--metrics=off',
        '--disable-version-check',
        '--exclude',
        '*.spec.ts',
        '--exclude',
        '*.test.ts',
        '--exclude',
        'node_modules',
        '--exclude',
        'data/static/codefixes',
        CONTAINER_ROOT,
      ],
    });
    return parseSemgrep(stdout, workspace.path);
  }
}
