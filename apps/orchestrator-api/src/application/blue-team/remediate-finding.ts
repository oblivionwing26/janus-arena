import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { FixUnderTest, FixVerifier } from '../../domain/fix/fix-verifier.js';
import type { GeneratedTest } from '../../domain/fix/generated-test.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import type { VcsPort } from '../../domain/vcs/vcs-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { revertEdits } from '../ui-engineer/generate-variant-patch.js';
import { unifiedDiff } from '../ui-engineer/unified-diff.js';
import { ProposeFix, type ProposeFixInput } from './propose-fix.js';

export const MAX_ITERATIONS = 3;

export type RemediateFindingResult =
  | {
      readonly status: 'fixed';
      readonly iterations: number;
      readonly patchId: string;
      readonly sha: string;
      readonly diff: string;
      readonly summary: string;
    }
  | { readonly status: 'open'; readonly iterations: number; readonly reason: string };

/**
 * The Blue Team loop (F3.5, CLAUDE.md): a fix that builds (ProposeFix), then each independent
 * verifier in order, stopping at the first that rejects it. A rejected fix is undone with a
 * reverting commit and the next iteration is told why; after MAX_ITERATIONS the finding stays
 * open. An accepted fix keeps the regression test V2 ran, committed on its branch. Every step
 * is an event: patch.proposed, verification.result, then finding.remediated.
 */
export class RemediateFinding {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
      readonly sandbox: SandboxPort;
      /** In order: V1, V2 (and V3 from F3.5 part B2). */
      readonly verifiers: readonly FixVerifier[];
      readonly regressionTest: (
        fix: Pick<FixUnderTest, 'poc' | 'findingId'>,
      ) => GeneratedTest | null;
    },
  ) {}

  async execute(input: Omit<ProposeFixInput, 'previous'>): Promise<RemediateFindingResult> {
    const { vcs, store, sandbox } = this.deps;
    const propose = new ProposeFix(this.deps);
    const recorder = new RunEventRecorder(store, input.runId, ORCHESTRATOR_ACTOR);
    const branch = JanusBranch.fix(input.findingId);
    let previous: ProposeFixInput['previous'];
    let reason = 'no iteration ran';

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const built = await propose.execute(previous === undefined ? input : { ...input, previous });
      if (built.status !== 'built') {
        reason = built.reason;
        previous = { diff: '', failure: built.reason };
        continue;
      }

      const fix: FixUnderTest = {
        runId: input.runId,
        target: input.target,
        findingId: input.findingId,
        poc: input.poc,
        repo: input.workspace.url,
        base: input.workspace.baseSha,
        head: built.sha,
        changedFiles: built.stats.files.map((file) => file.path),
        variantId: built.variantId,
        baseUrl: built.baseUrl,
      };
      let rejected: string | null = null;
      try {
        for (const verifier of this.deps.verifiers) {
          const verification = await verifier.verify(fix);
          await recorder.record('verification.result', {
            patchId: built.patchId,
            verifier: verifier.name,
            passed: verification.passed,
            details: verification.details.slice(0, 2000) || 'no details',
          });
          if (!verification.passed) {
            rejected = `${verifier.name}: ${verification.details}`;
            break;
          }
        }
      } finally {
        await sandbox.down(built.variantId);
      }

      if (rejected === null) {
        const regression = this.deps.regressionTest(fix);
        if (regression !== null) {
          await vcs.applyPatch(
            input.workspace,
            unifiedDiff(regression.path, null, regression.source),
          );
          await vcs.commit(
            input.workspace,
            `test(security): regression test for finding ${input.findingId}, generated from its PoC`,
          );
        }
        await recorder.record('finding.remediated', {
          findingId: input.findingId,
          status: 'fixed',
          iterations: iteration,
          patchId: built.patchId,
          branch,
        });
        return {
          status: 'fixed',
          iterations: iteration,
          patchId: built.patchId,
          sha: (await vcs.head(input.workspace)).sha,
          diff: built.diff,
          summary: built.summary,
        };
      }

      await revertEdits(vcs, input.workspace, built.edits);
      await vcs.commit(
        input.workspace,
        `revert: patch ${built.patchId} rejected by ${rejected}`.slice(0, 200),
      );
      previous = { diff: built.diff, failure: rejected };
      reason = rejected;
    }

    await recorder.record('finding.remediated', {
      findingId: input.findingId,
      status: 'open',
      iterations: MAX_ITERATIONS,
      reason: reason.slice(0, 2000),
    });
    return { status: 'open', iterations: MAX_ITERATIONS, reason };
  }
}
