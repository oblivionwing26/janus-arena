import { z } from 'zod';

import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import type { DockerCli } from '../sandbox/docker-cli.js';
import { runInContainer } from './container-tool.js';
import { CONTAINER_ROOT, readSnippet, repoPath } from './source-lines.js';

export const GITLEAKS_IMAGE = 'zricethezav/gitleaks:v8.30.1';
export const REDACTED = '[REDACTED]';

const outputSchema = z.array(
  z.object({
    RuleID: z.string(),
    Description: z.string(),
    File: z.string(),
    StartLine: z.int(),
    Secret: z.string(),
  }),
);

/**
 * gitleaks' JSON report as findings (F2.5, CLAUDE.md): the secret's value never leaves this
 * function. Its `Secret` and `Match` are dropped and every occurrence of the value in the
 * snippet is replaced by [REDACTED].
 */
export async function parseGitleaks(json: string, workspaceRoot: string): Promise<StaticFinding[]> {
  const leaks = outputSchema.parse(JSON.parse(json || '[]'));
  return Promise.all(
    leaks.map(async (leak) => {
      const file = repoPath(leak.File);
      const line = await readSnippet(workspaceRoot, file, leak.StartLine);
      return {
        kind: 'static' as const,
        tool: 'gitleaks' as const,
        rule: leak.RuleID,
        severity: 'high' as const,
        message: leak.Description,
        file,
        line: leak.StartLine,
        snippet: leak.Secret === '' ? line : line.split(leak.Secret).join(REDACTED),
      };
    }),
  );
}

/** gitleaks (pinned image) over the working tree, not the history, with no network (F2.5). */
export class GitleaksAnalysis implements StaticAnalysisPort {
  constructor(
    private readonly docker: DockerCli,
    private readonly image = GITLEAKS_IMAGE,
  ) {}

  async run(workspace: VcsWorkspace): Promise<StaticFinding[]> {
    const { stdout } = await runInContainer(this.docker, {
      image: this.image,
      network: 'none',
      copy: [{ from: workspace.path, to: CONTAINER_ROOT }],
      args: [
        'dir',
        CONTAINER_ROOT,
        '--report-format',
        'json',
        '--report-path',
        '-',
        '--no-banner',
        '--exit-code',
        '0',
        '--log-level',
        'error',
      ],
    });
    return parseGitleaks(stdout, workspace.path);
  }
}
