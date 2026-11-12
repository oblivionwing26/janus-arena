import { newUlid, type ProofOfConcept } from '@janus/shared-kernel';

import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { Budget } from '../../domain/llm/budget.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { LlmContentBlock } from '../../domain/llm/llm-message.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { BLUE_TEAM_LIMITS, exceedsLimits } from '../../domain/vcs/change-limits.js';
import type { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import { PatchRejectedError } from '../../domain/vcs/vcs-errors.js';
import type { DiffStats, VcsPort, VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { EditingAgent, type FileEdit } from '../code-agent/editing-agent.js';
import { EDITING_TOOLS } from '../code-agent/editing-tools.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { revertEdits } from '../ui-engineer/generate-variant-patch.js';
import { unifiedDiff } from '../ui-engineer/unified-diff.js';
import { blueTeamSystem, type FixCode } from './blue-team-prompt.js';

export interface GenerateFixInput {
  readonly runId: string;
  readonly findingId: string;
  readonly poc: ProofOfConcept;
  /** The finding's endpoint in the surface map, when it was found there. */
  readonly endpoint: Endpoint | null;
  /** The target's source, without its ground truth (ADR 0012). */
  readonly workspace: VcsWorkspace;
  readonly policy: EditPolicy;
  /** The policy's globs, as the agent reads them. */
  readonly allowed: readonly string[];
  readonly budget: Budget;
  /** On a retry: the previous fix and why it was rejected (build, checks or verifiers). */
  readonly retry?: { readonly diff: string; readonly failure: string };
  /** The strategy an alternative must follow (F3.6): another way to close the same flaw. */
  readonly direction?: string;
}

export type GenerateFixResult =
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
const EXCERPT_BEFORE = 5;
const EXCERPT_LINES = 60;

/** Backend sources only: never the tests (they could hold the answer) or the frontend. */
function readable(path: string): boolean {
  return path.endsWith('.ts') && !/^(test|frontend|cypress)\//.test(path);
}

/**
 * One Blue Team attempt on one confirmed finding (F3.5): let the agent edit the backend within
 * the policy, turn its edits into a patch, apply it on janus/fix-<findingId> and keep it only
 * within the limits (5 files, 200 lines). Records patch.proposed. Building the patched variant
 * and the verifiers come after.
 */
export class GenerateFix {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
    },
  ) {}

  async execute(input: GenerateFixInput): Promise<GenerateFixResult> {
    const { vcs, store } = this.deps;
    const branch = JanusBranch.fix(input.findingId);
    if ((await vcs.head(input.workspace)).branch !== branch) {
      await vcs.branch(input.workspace, branch);
    }
    const readFile = async (path: string) => {
      try {
        return readable(path) ? await vcs.readFile(input.workspace, path) : null;
      } catch {
        return null;
      }
    };

    const agentId = `blue-team-${input.findingId.toLowerCase()}`;
    const brief: LlmContentBlock[] = [
      { type: 'text', text: 'Fix the flaw described above in the files you may edit.' },
    ];
    if (input.direction !== undefined) {
      brief.push({
        type: 'text',
        text: `Close it with this approach, and no other: ${input.direction}`,
      });
    }
    if (input.retry !== undefined) {
      brief.push({
        type: 'text',
        text: `Your previous fix was rejected and has been undone. Previous patch:\n${input.retry.diff}\nWhy it was rejected (truncated):\n${input.retry.failure.slice(-MAX_FAILURE)}\nMake a fix that passes.`,
      });
    }

    const result = await new EditingAgent({ gateway: this.deps.gateway }).run({
      role: 'blue-team',
      tools: EDITING_TOOLS,
      readable,
      runId: input.runId,
      agentId,
      system: blueTeamSystem(input.poc, await fixCode(input.endpoint, readFile), input.allowed),
      brief,
      policy: input.policy,
      readFile,
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
    const over = exceedsLimits(stats, BLUE_TEAM_LIMITS);
    if (over !== null) {
      await revertEdits(vcs, input.workspace, result.edits);
      return { status: 'rejected', reason: over, summary: result.summary };
    }

    const patchId = newUlid();
    await new RunEventRecorder(store, input.runId, { agentId, role: 'blue-team' }).record(
      'patch.proposed',
      {
        patchId,
        author: 'blue-team',
        findingId: input.findingId,
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

/** The handler's code around its line, numbered, from the workspace the agent edits. */
async function fixCode(
  endpoint: Endpoint | null,
  readFile: (path: string) => Promise<string | null>,
): Promise<FixCode> {
  const at = endpoint?.handler ?? endpoint?.declaredAt;
  const text = at === undefined ? null : await readFile(at.file);
  if (endpoint === null || at === undefined || text === null) return { endpoint, excerpt: null };
  const lines = text.split('\n');
  const start = Math.max(1, at.line - EXCERPT_BEFORE);
  const shown = lines
    .slice(start - 1, start - 1 + EXCERPT_LINES)
    .map((line, index) => `${String(start + index).padStart(4)}| ${line}`);
  return { endpoint, excerpt: { path: at.file, startLine: start, text: shown.join('\n') } };
}
