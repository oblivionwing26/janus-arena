import type { ProofOfConcept } from '@janus/shared-kernel';

import type { AttackTargetFactory } from '../../domain/attack/attack-target.js';
import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { FixUnderTest, FixVerification, FixVerifier } from '../../domain/fix/fix-verifier.js';
import type { OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import type { OwnershipTokenPort } from '../../domain/scope/ownership-token-port.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';
import { ReplayPocs } from '../red-team/replay-pocs.js';
import { VerifyOwnership } from '../scope/verify-ownership.js';

/** Replays one PoC on a running variant and returns the oracle's verdict (null: none). */
export type ReplayOnVariant = (input: {
  readonly runId: string;
  readonly target: string;
  readonly variantId: string;
  readonly origin: string;
  readonly poc: ProofOfConcept;
}) => Promise<OracleVerdict | null>;

/**
 * The first verifier (F3.5, V1): the original PoC, replayed by code with fresh test users on the
 * patched variant, must no longer be exploitable. A replay nothing could judge fails: without a
 * verdict there is no proof the flaw is gone.
 */
export class PocReplayVerifier implements FixVerifier {
  readonly name = 'poc-replay' as const;

  constructor(private readonly deps: { readonly replay: ReplayOnVariant }) {}

  async verify(fix: FixUnderTest): Promise<FixVerification> {
    const result = await this.deps.replay({
      runId: fix.runId,
      target: fix.target,
      variantId: fix.variantId,
      origin: new URL(fix.baseUrl).origin,
      poc: fix.poc,
    });
    if (result === null) {
      return {
        passed: false,
        details: 'the replay could not be judged, so nothing proves the fix',
      };
    }
    return result.exploitable
      ? { passed: false, details: `the PoC still works: ${result.evidence}` }
      : { passed: true, details: `the PoC no longer works: ${result.evidence}` };
  }
}

/**
 * The replay of F3.4 on a patched variant: its ownership is verified for this run first, as for
 * any offensive test (CLAUDE.md), then ReplayPocs plays the PoC on a fresh bench.
 */
export function replayOnVariant(deps: {
  readonly store: EventStorePort;
  readonly http: ScopedHttpPort;
  readonly tokens: OwnershipTokenPort;
  readonly target: AttackTargetFactory;
  readonly browser?: BrowserAttackPort;
  readonly policyFor: (target: string, origin: string) => ScopePolicy;
}): ReplayOnVariant {
  return async (input) => {
    const scope = await new VerifyOwnership({
      tokens: deps.tokens,
      http: deps.http,
      store: deps.store,
    }).execute({
      runId: input.runId,
      variantId: input.variantId,
      policy: deps.policyFor(input.target, input.origin),
    });
    const [replayed] = await new ReplayPocs({
      store: deps.store,
      http: deps.http,
      target: deps.target,
      ...(deps.browser === undefined ? {} : { browser: deps.browser }),
    }).execute({ runId: input.runId, scope, origin: input.origin, pocs: [input.poc] });
    return replayed?.verdict ?? null;
  };
}
