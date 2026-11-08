import {
  newUlid,
  type FrictionZone,
  type JanusEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';

import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { Budget } from '../../domain/llm/budget.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { LlmContentBlock } from '../../domain/llm/llm-message.js';
import { exceedsLimits } from '../../domain/vcs/change-limits.js';
import type { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import { PatchRejectedError } from '../../domain/vcs/vcs-errors.js';
import type { DiffStats, VcsPort, VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { LocateFrictionCode } from '../locate-friction-code/locate-friction-code.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { UiEngineerAgent, type FileEdit } from './ui-engineer-agent.js';
import { uiEngineerSystem } from './ui-engineer-prompt.js';
import { unifiedDiff } from './unified-diff.js';

export interface GenerateVariantPatchInput {
  readonly runId: string;
  readonly zone: FrictionZone;
  readonly events: readonly (JanusEvent | UnknownEvent)[];
  readonly workspace: VcsWorkspace;
  readonly policy: EditPolicy;
  /** The policy's globs, as the agent reads them. */
  readonly allowed: readonly string[];
  readonly routes?: readonly string[];
  /** The zone's screenshot (PNG), when the run took one. */
  readonly screenshot?: Uint8Array;
  readonly budget: Budget;
  /** On a retry: the previous patch and why the checks rejected it. */
  readonly retry?: { readonly diff: string; readonly failure: string };
}

export type GenerateVariantPatchResult =
  | {
      readonly status: 'proposed';
      readonly patchId: string;
      readonly diff: string;
      readonly stats: DiffStats;
      readonly edits: readonly FileEdit[];
      readonly summary: string;
    }
  | {
      readonly status: 'no-change' | 'rejected';
      readonly reason: string;
      readonly summary: string;
    };

const MAX_FAILURE = 4000;

/** Undoes edits applied to the working tree, by applying their reverse patch. */
export async function revertEdits(
  vcs: VcsPort,
  workspace: VcsWorkspace,
  edits: readonly FileEdit[],
): Promise<void> {
  const reverse = edits.map((edit) => unifiedDiff(edit.path, edit.after, edit.before)).join('');
  if (reverse !== '') await vcs.applyPatch(workspace, reverse);
}

/**
 * One UI Engineer attempt on one friction zone (F2.3): locate the code (F2.2), let the agent
 * edit within the policy, turn its edits into a patch, apply it on janus/variant-<runId> and
 * keep it only within the limits (5 files, 200 lines). Records patch.proposed. Verification
 * (lint, typecheck, tests) and the commit come after (F2.3-B).
 */
export class GenerateVariantPatch {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
    },
  ) {}

  async execute(input: GenerateVariantPatchInput): Promise<GenerateVariantPatchResult> {
    const { vcs, store } = this.deps;
    const branch = JanusBranch.variant(input.runId);
    if ((await vcs.head(input.workspace)).branch !== branch) {
      await vcs.branch(input.workspace, branch);
    }

    const code = await new LocateFrictionCode({ vcs }).execute({
      zone: input.zone,
      events: input.events,
      workspace: input.workspace,
      ...(input.routes === undefined ? {} : { routes: input.routes }),
    });
    const agentId = `ui-engineer-z${String(input.zone.rank)}`;
    const brief: LlmContentBlock[] = [
      { type: 'text', text: 'Fix the friction described above in the files you may edit.' },
    ];
    if (input.screenshot !== undefined) {
      brief.push(
        { type: 'text', text: `A screenshot of ${input.zone.route} when the friction happened:` },
        {
          type: 'image',
          mediaType: 'image/png',
          data: Buffer.from(input.screenshot).toString('base64'),
        },
      );
    }
    if (input.retry !== undefined) {
      brief.push({
        type: 'text',
        text: `Your previous attempt was rejected by the project's checks and has been undone. Previous patch:\n${input.retry.diff}\nChecks output (truncated):\n${input.retry.failure.slice(-MAX_FAILURE)}\nMake a change that passes.`,
      });
    }

    const result = await new UiEngineerAgent({ gateway: this.deps.gateway }).run({
      runId: input.runId,
      agentId,
      system: uiEngineerSystem(input.zone, code, input.allowed),
      brief,
      policy: input.policy,
      readFile: async (path) => {
        try {
          return await vcs.readFile(input.workspace, path);
        } catch {
          return null;
        }
      },
      budget: input.budget,
    });
    if (result.edits.length === 0) {
      return {
        status: 'no-change',
        reason: `no edits (${result.outcome})`,
        summary: result.summary,
      };
    }

    const diff = result.edits
      .map((edit) => unifiedDiff(edit.path, edit.before, edit.after))
      .join('');
    try {
      await vcs.applyPatch(input.workspace, diff);
    } catch (error) {
      if (!(error instanceof PatchRejectedError)) throw error;
      return { status: 'rejected', reason: error.message, summary: result.summary };
    }
    const stats = await vcs.diffStats(input.workspace);
    const over = exceedsLimits(stats);
    if (over !== null) {
      await revertEdits(vcs, input.workspace, result.edits);
      return { status: 'rejected', reason: over, summary: result.summary };
    }

    const patchId = newUlid();
    await new RunEventRecorder(store, input.runId, { agentId, role: 'ui-engineer' }).record(
      'patch.proposed',
      {
        patchId,
        author: 'ui-engineer',
        branch,
        diff,
        ...(result.summary === '' ? {} : { summary: result.summary.slice(0, 2000) }),
      },
    );
    return {
      status: 'proposed',
      patchId,
      diff,
      stats,
      edits: result.edits,
      summary: result.summary,
    };
  }
}
