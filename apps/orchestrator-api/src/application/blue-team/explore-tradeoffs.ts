import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { FixUnderTest, FixVerification, FixVerifier } from '../../domain/fix/fix-verifier.js';
import { recommend, type TradeoffRow } from '../../domain/fix/tradeoff.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import type { VcsPort } from '../../domain/vcs/vcs-port.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { revertEdits } from '../ui-engineer/generate-variant-patch.js';
import { ProposeFix, type ProposeFixInput } from './propose-fix.js';

/**
 * The alternatives the Blue Team is asked for when V3 rejects its fix (F3.6): other ways to stop
 * guessing at an account's password. No CAPTCHA: Janus never builds one, and no synthetic shopper
 * should solve one.
 */
export const STRATEGIES = [
  {
    id: 'account-lockout',
    label: 'account lockout',
    direction:
      'lock the account for a while after several failed sign-ins in a row, refusing to sign in to it until then.',
  },
  {
    id: 'progressive-delay',
    label: 'progressive delay',
    direction:
      'make each failed sign-in to an account wait longer than the previous one before answering, without ever locking the account.',
  },
  {
    id: 'attempt-limit',
    label: 'per-account attempt limit',
    direction:
      'limit how many failed sign-ins an account accepts within a time window, answering 429 beyond the limit and letting attempts through again once the window passes.',
  },
] as const;

export interface ExploreTradeoffsResult {
  readonly rows: readonly TradeoffRow[];
  /** Each alternative's patch, by label, for the report. */
  readonly diffs: Readonly<Record<string, string>>;
  readonly recommendation: ReturnType<typeof recommend>;
}

/**
 * A trade-off report's measurements (F3.6): the Blue Team's free fix, then, if V3 rejects it,
 * one alternative per strategy. Each builds (ProposeFix), is measured with V1 and, when it closes
 * the attack, V3, and is undone. Code recommends one (`recommend`); the branch ends holding it,
 * and finding.remediated says whether the finding is fixed. V2 runs on the recommended fix in
 * the Blue Team loop, not on every alternative: it judges correctness, not the trade-off.
 */
export class ExploreTradeoffs {
  constructor(
    private readonly deps: {
      readonly gateway: LLMGatewayPort;
      readonly vcs: VcsPort;
      readonly store: EventStorePort;
      readonly sandbox: SandboxPort;
      readonly v1: FixVerifier;
      readonly v3: FixVerifier;
    },
  ) {}

  async execute(
    input: Omit<ProposeFixInput, 'previous'> & {
      /** Measure every strategy even when the free fix needs none (a full comparison). */
      readonly allStrategies?: boolean;
      /**
       * Measure only these strategies (by id), with no free fix: alternatives added to a report
       * measured before (F3.6), whose rows and patches come in `measured`.
       */
      readonly strategies?: readonly string[];
      readonly measured?: {
        readonly rows: readonly TradeoffRow[];
        readonly diffs: Readonly<Record<string, string>>;
      };
    },
  ): Promise<ExploreTradeoffsResult> {
    const { vcs, store } = this.deps;
    const recorder = new RunEventRecorder(store, input.runId, ORCHESTRATOR_ACTOR);
    const rows: TradeoffRow[] = [...(input.measured?.rows ?? [])];
    const diffs: Record<string, string> = { ...input.measured?.diffs };
    const measureAll = async (strategies: readonly (typeof STRATEGIES)[number][]) => {
      for (const strategy of strategies) {
        const measured = await this.measure(input, strategy.label, strategy);
        rows.push(measured.row);
        if (measured.diff !== null) diffs[strategy.label] = measured.diff;
      }
    };

    if (input.strategies !== undefined) {
      const wanted = new Set(input.strategies);
      await measureAll(STRATEGIES.filter((strategy) => wanted.has(strategy.id)));
    } else {
      const free = await this.measure(input, 'free fix', null);
      rows.push(free.row);
      if (free.diff !== null) diffs['free fix'] = free.diff;
      const settled = free.row.exploitable === false && free.row.uxPassed === true;
      if (!settled || input.allStrategies === true) await measureAll(STRATEGIES);
    }

    const recommendation = recommend(rows);
    const chosen = recommendation.row;
    const diff = chosen === null ? undefined : diffs[chosen.label];
    if (typeof chosen?.patchId === 'string' && diff !== undefined) {
      await vcs.applyPatch(input.workspace, diff);
      await vcs.commit(
        input.workspace,
        `fix(security): ${input.poc.endpoint} — ${chosen.label}\n\n${recommendation.reason}\n\nPatch ${chosen.patchId}, recommended by the Janus trade-off report.`,
      );
      await recorder.record('finding.remediated', {
        findingId: input.findingId,
        status: 'fixed',
        iterations: rows.length,
        patchId: chosen.patchId,
        branch: JanusBranch.fix(input.findingId),
      });
    } else {
      await recorder.record('finding.remediated', {
        findingId: input.findingId,
        status: 'open',
        iterations: rows.length,
        reason: recommendation.reason,
      });
    }
    return { rows, diffs, recommendation };
  }

  /** One alternative: build it, measure it with V1 then V3, undo it. */
  private async measure(
    input: Omit<ProposeFixInput, 'previous'>,
    label: string,
    strategy: (typeof STRATEGIES)[number] | null,
  ): Promise<{ readonly row: TradeoffRow; readonly diff: string | null }> {
    const { vcs, sandbox, store } = this.deps;
    const recorder = new RunEventRecorder(store, input.runId, ORCHESTRATOR_ACTOR);
    const proposal: Omit<ProposeFixInput, 'previous'> = {
      runId: input.runId,
      findingId: input.findingId,
      target: input.target,
      poc: input.poc,
      endpoint: input.endpoint,
      workspace: input.workspace,
      policy: input.policy,
      allowed: input.allowed,
      budget: input.budget,
    };
    const built = await new ProposeFix(this.deps).execute(
      strategy === null ? proposal : { ...proposal, direction: strategy.direction },
    );
    const base = { label, strategy: strategy?.id ?? null };
    if (built.status !== 'built') {
      return {
        row: {
          ...base,
          patchId: null,
          exploitable: null,
          ux: null,
          uxPassed: null,
          note: built.reason,
        },
        diff: null,
      };
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
    const verify = async (verifier: FixVerifier): Promise<FixVerification> => {
      const verification = await verifier.verify(fix);
      await recorder.record('verification.result', {
        patchId: built.patchId,
        verifier: verifier.name,
        passed: verification.passed,
        details: verification.details.slice(0, 2000) || 'no details',
      });
      return verification;
    };
    let v1: FixVerification;
    let v3: FixVerification | null = null;
    try {
      v1 = await verify(this.deps.v1);
      // An alternative that leaves the attack open is never recommended: V3 is not spent on it.
      if (v1.passed) v3 = await verify(this.deps.v3);
    } finally {
      await sandbox.down(built.variantId);
    }
    await revertEdits(vcs, input.workspace, built.edits);
    await vcs.commit(input.workspace, `revert: ${label} (patch ${built.patchId}) measured`);
    return {
      row: {
        ...base,
        patchId: built.patchId,
        exploitable: !v1.passed,
        ux: v3?.measured ?? null,
        uxPassed: v3?.passed ?? null,
        note: [v1.details, v3?.details].filter((part) => part !== undefined).join('; '),
      },
      diff: built.diff,
    };
  }
}
