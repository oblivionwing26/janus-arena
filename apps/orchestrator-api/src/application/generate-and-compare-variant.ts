import { newUlid, type SynthlabReport } from '@janus/shared-kernel';
import { buildSynthlabReport, frictionZones, type ReportConfig } from '@janus/synthlab-report';

import type { BuildChecksPort } from '../domain/checks/build-checks-port.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import { Budget } from '../domain/llm/budget.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { RunConfig } from '../domain/run/run-config.js';
import type { CompletedRun, SynthLabPort } from '../domain/run/synthlab-port.js';
import type { EditPolicy } from '../domain/vcs/edit-policy.js';
import { JanusBranch } from '../domain/vcs/janus-branch.js';
import type { VcsPort } from '../domain/vcs/vcs-port.js';
import { RunEventRecorder } from './run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from './start-run.js';
import { ProposeVariant, type ProposeVariantResult } from './ui-engineer/propose-variant.js';

export interface GenerateAndCompareInput {
  /** The run file: its first variant is A; B is generated. Personas, seeds and tasks are reused. */
  readonly config: RunConfig;
  /** The target's repository, ground truth and UI Engineer policy (docker/sandboxes/*.yaml). */
  readonly target: {
    readonly repo: string;
    readonly excludeFiles: readonly string[];
    readonly policy: EditPolicy;
    readonly allowed: readonly string[];
  };
  readonly report: ReportConfig;
  /** How many of the most intense zones the UI Engineer works on. */
  readonly zones: number;
  /** A completed discovery run to reuse instead of playing one. */
  readonly fromRunId?: string;
  /** The UI Engineer's own budget, apart from the SynthLab runs'. */
  readonly engineerBudget: { readonly maxTokens: number; readonly maxEur: number };
  /** A zone's screenshot, when its run stored one. */
  readonly screenshot?: (runId: string, artifact: string) => Promise<Uint8Array | undefined>;
}

export type GenerateAndCompareResult =
  | {
      readonly status: 'compared';
      readonly discoveryRunId: string;
      readonly variantRunId: string;
      readonly abRunId: string;
      readonly branch: string;
      readonly attempts: readonly {
        readonly zone: number;
        readonly result: ProposeVariantResult;
      }[];
      readonly report: SynthlabReport;
    }
  | {
      readonly status: 'no-variant';
      readonly discoveryRunId: string;
      readonly variantRunId: string;
      readonly attempts: readonly {
        readonly zone: number;
        readonly result: ProposeVariantResult;
      }[];
    };

/**
 * The automatic A/B (F2.4), from F1 and F2 pieces only: SynthLab on A finds the friction, the
 * UI Engineer patches the most intense zones on one janus/variant-<runId> branch (each patch
 * verified by the target's checks), and a paired SynthLab run compares A with that B. B is
 * built from the local clone; nothing is pushed. No verified patch, no A/B.
 */
export class GenerateAndCompareVariant {
  constructor(
    private readonly deps: {
      readonly synthlab: SynthLabPort;
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
      readonly checks: BuildChecksPort;
    },
  ) {}

  async execute(input: GenerateAndCompareInput): Promise<GenerateAndCompareResult> {
    const { synthlab, vcs, store } = this.deps;
    const [a] = input.config.variants;
    if (a === undefined) throw new Error('The run file needs a variant A');

    const discovery: CompletedRun =
      input.fromRunId === undefined
        ? await synthlab.runAndWait({ ...input.config, variants: [{ key: 'a', ref: a.ref }] })
        : { runId: input.fromRunId, events: await store.readRun(input.fromRunId) };
    const zones = frictionZones(discovery.events, {
      routes: input.report.routes,
      top: input.zones,
    });

    const variantRunId = newUlid();
    const budget = input.engineerBudget;
    const recorder = new RunEventRecorder(store, variantRunId, ORCHESTRATOR_ACTOR);
    await recorder.record('run.started', { budget });
    const workspace = await vcs.clone(input.target.repo, {
      runId: variantRunId,
      ref: a.ref,
      excludeFiles: input.target.excludeFiles,
    });
    const propose = new ProposeVariant(this.deps);
    const engineerBudget = new Budget(budget);
    const attempts: { zone: number; result: ProposeVariantResult }[] = [];
    for (const zone of zones) {
      const screenshot =
        zone.screenshot === null
          ? undefined
          : await input.screenshot?.(discovery.runId, zone.screenshot.artifact);
      const result = await propose.execute({
        runId: variantRunId,
        zone,
        events: discovery.events,
        workspace,
        policy: input.target.policy,
        allowed: input.target.allowed,
        routes: input.report.routes,
        budget: engineerBudget,
        ...(screenshot === undefined ? {} : { screenshot }),
      });
      attempts.push({ zone: zone.rank, result });
    }
    const verified = attempts.filter(({ result }) => result.status === 'verified').length;
    await recorder.record('run.completed', {
      outcome: verified > 0 ? 'success' : 'error',
      ...(verified > 0 ? {} : { reason: 'no verified patch' }),
    });
    if (verified === 0) {
      return { status: 'no-variant', discoveryRunId: discovery.runId, variantRunId, attempts };
    }

    const branch = JanusBranch.variant(variantRunId);
    const ab = await synthlab.runAndWait({
      ...input.config,
      variants: [
        { key: 'a', ref: a.ref },
        { key: 'b', ref: branch, repo: workspace.url },
      ],
    });
    return {
      status: 'compared',
      discoveryRunId: discovery.runId,
      variantRunId,
      abRunId: ab.runId,
      branch,
      attempts,
      report: buildSynthlabReport(ab.runId, ab.events, input.report),
    };
  }
}
