import { newUlid } from '@janus/shared-kernel';

import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import { NetworkGuard, type BlockedRequest } from '../../domain/scope/network-guard.js';
import type { OwnershipTokenPort } from '../../domain/scope/ownership-token-port.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedHttpPort } from '../../domain/scope/scoped-http-port.js';
import { VERIFICATION_PATH, VerifiedScope } from '../../domain/scope/verified-scope.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';

export interface VerifyOwnershipInput {
  readonly runId: string;
  /** The sandboxed variant that serves the policy's origins. */
  readonly variantId: string;
  readonly policy: ScopePolicy;
}

/** scope.blocked for every request a guard refuses, recorded in the run. */
export function recordBlocked(
  recorder: RunEventRecorder,
): (blocked: BlockedRequest) => Promise<void> {
  return (blocked) => recorder.record('scope.blocked', { ...blocked });
}

/**
 * Proves a sandboxed target is ours (F3.1, ADR 0005): places a fresh token in the variant,
 * reads it back from every origin of the policy through the guard, and returns the verified
 * scope that offensive modules require. Records scope.verified; the token is not recorded.
 */
export class VerifyOwnership {
  constructor(
    private readonly deps: {
      readonly tokens: OwnershipTokenPort;
      readonly http: ScopedHttpPort;
      readonly store: EventStorePort;
      readonly now?: () => Date;
    },
  ) {}

  async execute(input: VerifyOwnershipInput): Promise<VerifiedScope> {
    const recorder = new RunEventRecorder(this.deps.store, input.runId, ORCHESTRATOR_ACTOR);
    const token = `janus-verify-${newUlid()}`;
    await this.deps.tokens.place(input.variantId, token);

    const client = this.deps.http.client(new NetworkGuard(input.policy), recordBlocked(recorder));
    const served = new Map<string, string | null>();
    for (const origin of input.policy.origins) {
      const reply = await client.send({
        method: 'GET',
        url: `${origin}${VERIFICATION_PATH}`,
        testType: 'http-probe',
      });
      served.set(origin, reply.status === 200 ? reply.body.slice(0, 1_000) : null);
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const scope = VerifiedScope.verify(input.policy, token, served, now.toISOString());
    await recorder.record('scope.verified', {
      target: input.policy.target,
      origins: [...input.policy.origins],
      excludedPaths: [...input.policy.excludedPaths],
      allowedTests: [...input.policy.allowedTests],
      maxRequestsPerSecond: input.policy.maxRequestsPerSecond,
    });
    return scope;
  }
}
