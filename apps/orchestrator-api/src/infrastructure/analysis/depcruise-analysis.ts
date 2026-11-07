import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { cruise } from 'dependency-cruiser';
import { z } from 'zod';

import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { FindingSeverity, StaticFinding } from '../../domain/analysis/static-finding.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';

const violationsSchema = z.array(
  z.object({
    from: z.string(),
    to: z.string(),
    rule: z.object({ name: z.string(), severity: z.string() }),
  }),
);

const SEVERITY: Readonly<Record<string, FindingSeverity>> = {
  error: 'medium',
  warn: 'low',
  info: 'info',
};

/** dependency-cruiser's violations as findings, at the importing file. */
export function parseDepcruise(
  violations: unknown,
  comments: Readonly<Record<string, string>> = {},
): StaticFinding[] {
  return violationsSchema.parse(violations).map((violation) => ({
    kind: 'static',
    tool: 'dependency-cruiser',
    rule: violation.rule.name,
    severity: SEVERITY[violation.rule.severity] ?? 'low',
    message: `${comments[violation.rule.name] ?? violation.rule.name} (${violation.from} → ${violation.to})`,
    file: violation.from,
    line: 0,
    snippet: `${violation.from} → ${violation.to}`,
  }));
}

/**
 * dependency-cruiser over a target's source with the target's own architecture rules (F2.5,
 * config/arch/<target>.depcruise.cjs). It only parses imports; nothing of the target runs.
 */
export class DepcruiseAnalysis implements StaticAnalysisPort {
  constructor(
    private readonly rulesFile: string,
    private readonly sourceDir = 'src',
  ) {}

  async run(workspace: VcsWorkspace): Promise<StaticFinding[]> {
    const ruleSet = createRequire(import.meta.url)(this.rulesFile) as {
      forbidden: { name: string; comment?: string }[];
    };
    const tsConfig = join(workspace.path, 'tsconfig.json');
    const previous = process.cwd();
    // dependency-cruiser resolves paths from the working directory.
    process.chdir(workspace.path);
    try {
      const result = await cruise([this.sourceDir], {
        validate: true,
        ruleSet: ruleSet as never,
        doNotFollow: { path: 'node_modules' },
        ...(existsSync(tsConfig) ? { tsConfig: { fileName: tsConfig } } : {}),
      });
      const output = result.output as { summary: { violations: unknown } };
      return parseDepcruise(
        output.summary.violations,
        Object.fromEntries(ruleSet.forbidden.map((rule) => [rule.name, rule.comment ?? rule.name])),
      );
    } finally {
      process.chdir(previous);
    }
  }
}
