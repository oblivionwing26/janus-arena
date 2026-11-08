import { newUlid } from '@janus/shared-kernel';

import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { AttackSurfacePort } from '../../domain/surface/attack-surface-port.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import type { VcsPort, VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import {
  gate,
  introducedFindings,
  surfaceChanges,
  type EndpointChange,
  type GateVerdict,
} from './diff-audit.js';

export interface AuditSide {
  /** Branch, tag or commit. */
  readonly ref: string;
  /** Where to clone it from; the target's repository when absent (a local clone for B). */
  readonly repo?: string;
}

export interface AuditVariantDiffInput {
  readonly runId: string;
  /** The target's repository. */
  readonly repo: string;
  readonly excludeFiles?: readonly string[];
  readonly base: AuditSide;
  readonly variant: AuditSide;
}

export interface AuditVariantDiffResult {
  readonly base: { readonly ref: string; readonly sha: string };
  readonly variant: { readonly ref: string; readonly sha: string };
  readonly findings: readonly StaticFinding[];
  readonly endpoints: readonly EndpointChange[];
  readonly verdict: GateVerdict;
  /** The throwaway clones of A and B, for the caller to remove. */
  readonly workspaces: readonly VcsWorkspace[];
}

/**
 * The differential audit (F2.7): the same static analysis (F2.5) and HTTP surface map (F2.6) on
 * base A and variant B, and only what B introduces. Each introduced finding and endpoint change
 * is recorded as finding.created (suspected); audit.completed carries the gate's verdict: B is
 * blocked when it introduces anything high or critical.
 */
export class AuditVariantDiff {
  constructor(
    private readonly deps: {
      readonly vcs: VcsPort;
      readonly tools: readonly StaticAnalysisPort[];
      readonly surface: AttackSurfacePort;
      readonly store: EventStorePort;
    },
  ) {}

  async execute(input: AuditVariantDiffInput): Promise<AuditVariantDiffResult> {
    const base = await this.scan(input, input.base);
    const variant = await this.scan(input, input.variant);
    const findings = introducedFindings(base.findings, variant.findings);
    const endpoints = surfaceChanges(base.endpoints, variant.endpoints);
    const verdict = gate(findings, endpoints);

    const recorder = new RunEventRecorder(this.deps.store, input.runId, ORCHESTRATOR_ACTOR);
    for (const finding of findings) {
      await recorder.record('finding.created', {
        findingId: newUlid(),
        kind: 'static',
        severity: finding.severity,
        title: `B introduces ${finding.tool}: ${finding.rule} at ${finding.file}${finding.line > 0 ? `:${String(finding.line)}` : ''}`,
        status: 'suspected',
      });
    }
    for (const change of endpoints) {
      await recorder.record('finding.created', {
        findingId: newUlid(),
        kind: 'static',
        severity: change.severity,
        title: `B introduces ${change.endpoint.method} ${change.endpoint.route}: ${change.reason}`,
        status: 'suspected',
      });
    }
    const result = {
      base: { ref: input.base.ref, sha: base.sha },
      variant: { ref: input.variant.ref, sha: variant.sha },
      findings,
      endpoints,
      verdict,
      workspaces: [base.workspace, variant.workspace],
    };
    await recorder.record('audit.completed', {
      base: result.base,
      variant: result.variant,
      introduced: {
        findings: findings.length,
        endpoints: endpoints.length,
        high: verdict.high,
        critical: verdict.critical,
      },
      blocked: verdict.blocked,
      reasons: verdict.reasons.slice(0, 50).map((reason) => reason.slice(0, 300)),
    });
    return result;
  }

  private async scan(
    input: AuditVariantDiffInput,
    side: AuditSide,
  ): Promise<{
    workspace: VcsWorkspace;
    sha: string;
    findings: StaticFinding[];
    endpoints: Endpoint[];
  }> {
    const workspace: VcsWorkspace = await this.deps.vcs.clone(side.repo ?? input.repo, {
      runId: newUlid(),
      ref: side.ref,
      depth: 1,
      ...(input.excludeFiles === undefined ? {} : { excludeFiles: input.excludeFiles }),
    });
    const findings: StaticFinding[] = [];
    for (const tool of this.deps.tools) findings.push(...(await tool.run(workspace)));
    return {
      workspace,
      sha: (await this.deps.vcs.head(workspace)).sha,
      findings,
      endpoints: await this.deps.surface.map(workspace),
    };
  }
}
