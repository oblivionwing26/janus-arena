import { newUlid } from '@janus/shared-kernel';

import type { StaticAnalysisPort } from '../domain/analysis/static-analysis-port.js';
import type { FindingSeverity, StaticFinding } from '../domain/analysis/static-finding.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { VcsWorkspace } from '../domain/vcs/vcs-port.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from './start-run.js';

const RANK: Readonly<Record<FindingSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Every static analysis tool over one workspace (F2.5), one after another, and each finding
 * recorded as `finding.created`, status `suspected`: a tool's report is a lead, never a
 * confirmed vulnerability (that takes a reproducible PoC, F3). Most severe first.
 */
export class RunStaticAnalysis {
  constructor(
    private readonly deps: {
      readonly tools: readonly StaticAnalysisPort[];
      readonly store: EventStorePort;
    },
  ) {}

  async execute(input: { runId: string; workspace: VcsWorkspace }): Promise<StaticFinding[]> {
    const findings: StaticFinding[] = [];
    for (const tool of this.deps.tools) findings.push(...(await tool.run(input.workspace)));
    findings.sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.rule.localeCompare(b.rule),
    );

    const recorder = new RunEventRecorder(this.deps.store, input.runId, ORCHESTRATOR_ACTOR);
    for (const finding of findings) {
      await recorder.record('finding.created', {
        findingId: newUlid(),
        kind: 'static',
        severity: finding.severity,
        title: `${finding.tool}: ${finding.rule} at ${finding.file}${finding.line > 0 ? `:${String(finding.line)}` : ''}`,
        status: 'suspected',
        tool: finding.tool,
        rule: finding.rule,
        file: finding.file,
        line: finding.line,
      });
    }
    return findings;
  }
}
