import type { ProofOfConcept } from '@janus/shared-kernel';

import type { TradeoffRow } from '../fix/tradeoff.js';

/** What each run contributes to a dual report (F3.7). */
export type ReportRunRole = 'ux' | 'audit' | 'red-team' | 'blue-team' | 'v3';

export interface ReportFinding {
  readonly findingId: string;
  readonly runId: string;
  readonly kind: 'static' | 'dynamic';
  readonly severity: string;
  readonly title: string;
  readonly status: 'suspected' | 'confirmed';
  /** `file:line` for static findings, the endpoint for dynamic ones. */
  readonly where: string;
  readonly tool: string;
}

export interface ReportFix {
  readonly runId: string;
  readonly findingId: string;
  readonly status: 'fixed' | 'open';
  readonly iterations: number;
  readonly branch: string | null;
  readonly patchId: string | null;
  readonly diff: string | null;
  readonly verifications: readonly {
    readonly verifier: string;
    readonly passed: boolean;
    readonly details: string;
  }[];
}

/**
 * The signed dual report (F3.7, VISION): the UX A/B and the security results of one review,
 * built by code from the event logs it names, whose hashes it carries. Synthetic task success,
 * never conversion.
 */
export interface DualReport {
  readonly format: 'janus-dual-report';
  readonly version: 1;
  readonly target: string;
  /** The Janus commit that built the report. */
  readonly janusCommit: string;
  readonly ux: {
    readonly runId: string;
    readonly variants: readonly {
      readonly variant: string;
      readonly personas: { readonly successes: number; readonly n: number } | null;
      readonly baseline: { readonly successes: number; readonly n: number };
    }[];
    readonly difference: {
      readonly mean: number;
      readonly low: number;
      readonly high: number;
    } | null;
    readonly verdict: string | null;
  } | null;
  readonly findings: readonly ReportFinding[];
  readonly pocs: readonly { readonly findingId: string; readonly poc: ProofOfConcept }[];
  readonly fixes: readonly ReportFix[];
  readonly tradeoffs: readonly {
    readonly findingId: string;
    readonly rows: readonly TradeoffRow[];
    readonly recommendation: { readonly label: string | null; readonly reason: string };
  }[];
  readonly cost: {
    readonly runs: readonly {
      readonly runId: string;
      readonly role: ReportRunRole;
      readonly eur: number;
    }[];
    readonly totalEur: number;
  };
  /** SHA-256 of each run's event log, as eventLogHash computes it. */
  readonly eventLogs: readonly { readonly runId: string; readonly sha256: string }[];
  /** Name → version of what produced the results: Node, images, models... */
  readonly tools: Readonly<Record<string, string>>;
}
