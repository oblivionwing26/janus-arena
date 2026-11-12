import type { ProofOfConcept } from '@janus/shared-kernel';

/** A fix as the verifiers see it (F3.5): its finding, its commits and its running variant. */
export interface FixUnderTest {
  /** The Blue Team run: verifiers record their attempts and verdicts in it. */
  readonly runId: string;
  readonly target: string;
  readonly findingId: string;
  readonly poc: ProofOfConcept;
  /** The local clone the fix was committed in, and the commits it goes from and to. */
  readonly repo: string;
  readonly base: string;
  readonly head: string;
  /** The files the fix changed against the base (V3 measures the endpoints they serve). */
  readonly changedFiles: readonly string[];
  /** The patched variant, up in the sandbox. */
  readonly variantId: string;
  readonly baseUrl: string;
}

export interface FixVerification {
  readonly passed: boolean;
  readonly details: string;
  /** What V3 measured (F3.6): the trade-off table compares alternatives by these numbers. */
  readonly measured?: UxMeasurement;
}

export interface UxMeasurement {
  /** The paired SynthLab run. */
  readonly runId: string;
  readonly a: { readonly successes: number; readonly n: number } | null;
  readonly b: { readonly successes: number; readonly n: number } | null;
  readonly latency: readonly {
    readonly endpoint: string;
    readonly a: number | null;
    readonly b: number | null;
  }[];
}

/**
 * One of the Blue Team's three independent verifiers (CLAUDE.md): code that judges a fix, never
 * the agent that wrote it. `name` is the verification.result verifier it records.
 */
export interface FixVerifier {
  readonly name: 'poc-replay' | 'regression-tests' | 'synthlab-rerun';
  verify(fix: FixUnderTest): Promise<FixVerification>;
}
