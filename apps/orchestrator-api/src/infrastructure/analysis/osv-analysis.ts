import { z } from 'zod';

import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { FindingSeverity, StaticFinding } from '../../domain/analysis/static-finding.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import type { DockerCli } from '../sandbox/docker-cli.js';
import { runInContainer } from './container-tool.js';
import { CONTAINER_ROOT, repoPath } from './source-lines.js';

export const OSV_IMAGE = 'ghcr.io/google/osv-scanner:v2.6.0';

const outputSchema = z.object({
  results: z
    .array(
      z.object({
        source: z.object({ path: z.string() }),
        packages: z.array(
          z.object({
            package: z.object({ name: z.string(), version: z.string() }),
            vulnerabilities: z.array(
              z.object({
                id: z.string(),
                summary: z.string().optional(),
                database_specific: z.object({ severity: z.string().optional() }).optional(),
              }),
            ),
            groups: z.array(
              z.object({ ids: z.array(z.string()), max_severity: z.string().optional() }),
            ),
          }),
        ),
      }),
    )
    .default([]),
});

const LABELS: Readonly<Record<string, FindingSeverity>> = {
  LOW: 'low',
  MODERATE: 'medium',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/** CVSS base score to severity, as the CVSS v3 ratings define it. */
function fromScore(score: number): FindingSeverity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return score > 0 ? 'low' : 'info';
}

/**
 * osv-scanner's JSON report as findings (F2.5): one finding per vulnerability group of a
 * package (aliases of the same advisory count once), at line 0 of the lockfile.
 */
export function parseOsv(json: string): StaticFinding[] {
  const { results } = outputSchema.parse(JSON.parse(json));
  return results.flatMap((result) =>
    result.packages.flatMap(({ package: pkg, vulnerabilities, groups }) =>
      groups.map((group) => {
        const [id = 'unknown'] = group.ids;
        const advisory = vulnerabilities.find((vulnerability) =>
          group.ids.includes(vulnerability.id),
        );
        const score = Number(group.max_severity);
        const label = advisory?.database_specific?.severity?.toUpperCase();
        return {
          kind: 'static' as const,
          tool: 'osv-scanner' as const,
          rule: id,
          severity:
            Number.isFinite(score) && score > 0
              ? fromScore(score)
              : (LABELS[label ?? ''] ?? 'medium'),
          message: `${pkg.name}@${pkg.version}: ${advisory?.summary ?? 'known vulnerability'}`,
          file: repoPath(result.source.path),
          line: 0,
          snippet: `${pkg.name}@${pkg.version}`,
        };
      }),
    ),
  );
}

/**
 * osv-scanner (pinned image) over the lockfiles (F2.5). The one tool with network: it sends
 * package names and versions to osv.dev; it never runs the target's code.
 */
export class OsvAnalysis implements StaticAnalysisPort {
  constructor(
    private readonly docker: DockerCli,
    private readonly image = OSV_IMAGE,
  ) {}

  async run(workspace: VcsWorkspace): Promise<StaticFinding[]> {
    const { stdout } = await runInContainer(this.docker, {
      image: this.image,
      network: 'bridge',
      copy: [{ from: workspace.path, to: CONTAINER_ROOT }],
      args: ['scan', 'source', '--format', 'json', '--recursive', CONTAINER_ROOT],
      // 1: vulnerabilities found; 128: no lockfile to scan.
      okExitCodes: [1, 128],
    });
    return stdout.trim() === '' ? [] : parseOsv(stdout);
  }
}
