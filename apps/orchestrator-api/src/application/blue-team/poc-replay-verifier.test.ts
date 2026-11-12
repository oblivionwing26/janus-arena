// F3.5, V1: the original PoC, replayed by code on the patched variant, must no longer work.

import type { ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { FixUnderTest } from '../../domain/fix/fix-verifier.js';
import { verdict, type OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import { PocReplayVerifier, type ReplayOnVariant } from './poc-replay-verifier.js';

const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};
const FIX: FixUnderTest = {
  runId: '01JC0F29B7E0000000000000AA',
  target: 'juice-shop',
  findingId: '01JC0F29B7E0000000000000FF',
  poc: POC,
  repo: 'file:///workspaces/x',
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  variantId: 'fix-x',
  baseUrl: 'http://janus-fix-x-app:3000',
};

function replaying(result: OracleVerdict | null) {
  const calls: Parameters<ReplayOnVariant>[0][] = [];
  const replay: ReplayOnVariant = (input) => {
    calls.push(input);
    return Promise.resolve(result);
  };
  return { verifier: new PocReplayVerifier({ replay }), calls };
}

describe('PocReplayVerifier (F3.5, V1)', () => {
  it('passes when the oracle says the replay is no longer exploitable', async () => {
    const { verifier, calls } = replaying(verdict(false, 'B got 403 for the basket of A'));

    expect(await verifier.verify(FIX)).toEqual({
      passed: true,
      details: 'the PoC no longer works: B got 403 for the basket of A',
    });
    expect(calls).toEqual([
      {
        runId: FIX.runId,
        target: 'juice-shop',
        variantId: 'fix-x',
        origin: 'http://janus-fix-x-app:3000',
        poc: POC,
      },
    ]);
  });

  it('fails when the PoC still works', async () => {
    const { verifier } = replaying(verdict(true, 'canary of A in the reply to B'));

    expect(await verifier.verify(FIX)).toEqual({
      passed: false,
      details: 'the PoC still works: canary of A in the reply to B',
    });
  });

  it('fails when nothing could be judged: without a verdict there is no proof', async () => {
    const { verifier } = replaying(null);

    expect((await verifier.verify(FIX)).passed).toBe(false);
  });
});
