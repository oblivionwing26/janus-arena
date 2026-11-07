import type { BuildChecksPort } from '../../domain/checks/build-checks-port.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { DiffStats, VcsPort } from '../../domain/vcs/vcs-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import {
  GenerateVariantPatch,
  revertEdits,
  type GenerateVariantPatchInput,
} from './generate-variant-patch.js';

export type ProposeVariantResult =
  | {
      readonly status: 'verified';
      readonly patchId: string;
      readonly sha: string;
      readonly diff: string;
      readonly stats: DiffStats;
      readonly summary: string;
      readonly attempts: number;
    }
  | {
      readonly status: 'failed';
      /** Why the last attempt ended: no change, rejected by the limits, or failed checks. */
      readonly reason: string;
      readonly attempts: number;
    };

const MAX_ATTEMPTS = 2;
const MAX_DETAILS = 2000;

/**
 * A verified variant B for one friction zone (F2.3): a UI Engineer attempt, then the target's
 * own checks (lint, typecheck, tests) on the patched workspace. A failure is undone and retried
 * once with the checks' output as context; a second failure discards the patch. Every check
 * records verification.result; only a passing patch is committed on janus/variant-<runId>.
 */
export class ProposeVariant {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
      readonly checks: BuildChecksPort;
    },
  ) {}

  async execute(input: Omit<GenerateVariantPatchInput, 'retry'>): Promise<ProposeVariantResult> {
    const { vcs, store, checks, gateway } = this.deps;
    const generate = new GenerateVariantPatch({ gateway, vcs, store });
    const recorder = new RunEventRecorder(store, input.runId, ORCHESTRATOR_ACTOR);
    let retry: GenerateVariantPatchInput['retry'];
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

      const result = await checks.run(input.workspace);
      await recorder.record('verification.result', {
        patchId: proposed.patchId,
        verifier: 'build-checks',
        passed: result.passed,
        details: result.passed
          ? `lint, typecheck and tests passed in ${String(Math.round(result.durationMs / 1000))} s`
          : result.output.slice(-MAX_DETAILS) || 'the checks failed',
      });
      if (result.passed) {
        const title = proposed.summary.split('\n')[0]?.slice(0, 72) ?? '';
        const sha = await vcs.commit(
          input.workspace,
          `fix(ui): ${input.zone.route} — ${title}\n\n${proposed.summary}\n\nPatch ${proposed.patchId}, proposed by the Janus UI Engineer.`,
        );
        return {
          status: 'verified',
          patchId: proposed.patchId,
          sha,
          diff: proposed.diff,
          stats: proposed.stats,
          summary: proposed.summary,
          attempts: attempt,
        };
      }

      await revertEdits(vcs, input.workspace, proposed.edits);
      retry = { diff: proposed.diff, failure: result.output };
      reason = 'the checks failed';
    }
    return { status: 'failed', reason, attempts: MAX_ATTEMPTS };
  }
}
