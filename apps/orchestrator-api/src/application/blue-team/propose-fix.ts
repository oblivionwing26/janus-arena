import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import { SandboxStartError } from '../../domain/sandbox/sandbox-errors.js';
import type { SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import type { DiffStats, VcsPort } from '../../domain/vcs/vcs-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { revertEdits } from '../ui-engineer/generate-variant-patch.js';
import { GenerateFix, type GenerateFixInput } from './generate-fix.js';

export type ProposeFixResult =
  | {
      readonly status: 'built';
      readonly patchId: string;
      readonly sha: string;
      readonly diff: string;
      readonly stats: DiffStats;
      readonly summary: string;
      readonly attempts: number;
      /** The patched variant, still up: the caller probes or verifies it, then takes it down. */
      readonly variantId: string;
      readonly baseUrl: string;
    }
  | {
      readonly status: 'failed';
      /** Why the last attempt ended: no change, rejected by the limits, or a failed build. */
      readonly reason: string;
      readonly attempts: number;
    };

export interface ProposeFixInput extends Omit<GenerateFixInput, 'retry'> {
  /** The sandbox definition the patched variant is built from (ADR 0012). */
  readonly target: string;
}

const MAX_ATTEMPTS = 2;
const MAX_DETAILS = 2000;

/**
 * A fix that builds (F3.5 part A): a Blue Team attempt, committed on janus/fix-<findingId>, then
 * its patched variant built and started in the sandbox; the build's type check is the first
 * check. A failure is undone (a reverting commit, so the branch keeps the record) and retried
 * once with the build output as context. Every build records verification.result. The three
 * verifiers come after (F3.5 part B).
 */
export class ProposeFix {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
      readonly sandbox: SandboxPort;
    },
  ) {}

  async execute(input: ProposeFixInput): Promise<ProposeFixResult> {
    const { vcs, store, sandbox, gateway } = this.deps;
    const generate = new GenerateFix({ gateway, vcs, store });
    const recorder = new RunEventRecorder(store, input.runId, ORCHESTRATOR_ACTOR);
    const variantId = `fix-${input.findingId.slice(-12).toLowerCase()}`;
    let retry: GenerateFixInput['retry'];
    let reason = 'no attempt';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const proposed = await generate.execute(retry === undefined ? input : { ...input, retry });
      if (proposed.status !== 'proposed') {
        return {
          status: 'failed',
          reason: `${proposed.status}: ${proposed.reason}`,
          attempts: attempt,
        };
      }
      const title = proposed.summary.split('\n')[0]?.slice(0, 72) ?? '';
      const sha = await vcs.commit(
        input.workspace,
        `fix(security): ${input.poc.endpoint} — ${title}\n\n${proposed.summary}\n\nPatch ${proposed.patchId}, proposed by the Janus Blue Team for finding ${input.findingId}.`,
      );

      try {
        const { baseUrl } = await sandbox.up({
          id: variantId,
          target: input.target,
          ref: `janus/fix-${input.findingId}`,
          repo: input.workspace.url,
          base: input.workspace.baseSha,
        });
        await recorder.record('verification.result', {
          patchId: proposed.patchId,
          verifier: 'build-checks',
          passed: true,
          details: 'the patched variant compiles (tsc) and starts',
        });
        return {
          status: 'built',
          patchId: proposed.patchId,
          sha,
          diff: proposed.diff,
          stats: proposed.stats,
          summary: proposed.summary,
          attempts: attempt,
          variantId,
          baseUrl,
        };
      } catch (error) {
        if (!(error instanceof SandboxStartError)) throw error;
        await recorder.record('verification.result', {
          patchId: proposed.patchId,
          verifier: 'build-checks',
          passed: false,
          details: error.message.slice(-MAX_DETAILS),
        });
        await revertEdits(vcs, input.workspace, proposed.edits);
        await vcs.commit(input.workspace, `revert: patch ${proposed.patchId} does not build`);
        retry = { diff: proposed.diff, failure: error.message };
        reason = 'the patched variant does not build';
      }
    }
    return { status: 'failed', reason, attempts: MAX_ATTEMPTS };
  }
}
