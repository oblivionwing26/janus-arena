// F3.5, V3: SynthLab plays the original (A) and the fix (B) in one paired run; code judges the
// shoppers' success and the latency of the endpoints the fix touched. A stub SynthLab.

import { newUlid, parseEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { reportConfigSchema } from '@janus/synthlab-report';
import { describe, expect, it } from 'vitest';

import type { FixUnderTest } from '../../domain/fix/fix-verifier.js';
import type { RunConfig } from '../../domain/run/run-config.js';
import type { CompletedRun, SynthLabPort } from '../../domain/run/synthlab-port.js';
import { SynthlabRerunVerifier } from './synthlab-rerun-verifier.js';

const FINDING = '01JC0F2DB7E0000000000000FF';
const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};
const FIX: FixUnderTest = {
  runId: '01JC0F2DB7E0000000000000AA',
  target: 'juice-shop',
  findingId: FINDING,
  poc: POC,
  repo: 'file:///workspaces/01JC0F2DB7E0000000000000AA',
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  changedFiles: ['routes/basket.ts'],
  variantId: 'fix-x',
  baseUrl: 'http://janus-fix-x-app:3000',
};
const CONFIG: RunConfig = {
  target: 'juice-shop',
  variants: [{ key: 'a', ref: 'image' }],
  personas: ['carmen-retired'],
  seeds: [1, 2],
  budget: { maxTokens: 1_000_000, maxEur: 1.2 },
};

/** A paired run: every persona session succeeds on A; on B as `successB` says. */
class StubSynthLab implements SynthLabPort {
  readonly configs: RunConfig[] = [];
  constructor(
    private readonly successB: boolean,
    private readonly basketMs: { a: number; b: number },
  ) {}

  runAndWait(config: RunConfig): Promise<CompletedRun> {
    this.configs.push(config);
    const runId = newUlid();
    let seq = 0;
    const event = (agentId: string, type: string, payload: unknown) =>
      parseEvent({
        id: newUlid(),
        runId,
        seq: seq++,
        ts: '2026-11-12T10:00:00.000Z',
        schemaVersion: 1,
        actor: { agentId, role: agentId === 'orchestrator' ? 'orchestrator' : 'navigator' },
        type,
        payload,
      });
    const events = [
      event('orchestrator', 'run.started', { budget: config.budget }),
      ...config.variants.flatMap(({ key }) =>
        [1, 2].flatMap((seed) => {
          const agent = `carmen-${key}-s${String(seed)}-a1`;
          return [
            event(agent, 'session.started', {
              variant: key,
              kind: 'persona',
              persona: 'carmen-retired',
              seed,
              attempt: 1,
            }),
            event(agent, 'page.requests', {
              stepIndex: 0,
              requests: [
                {
                  method: 'GET',
                  path: '/rest/basket/6',
                  status: 200,
                  ms: key === 'a' ? this.basketMs.a : this.basketMs.b,
                },
              ],
            }),
            event(agent, 'session.ended', {
              outcome: key === 'a' || this.successB ? 'success' : 'abandon',
              steps: 4,
              durationMs: 1,
            }),
          ];
        }),
      ),
      event('orchestrator', 'run.completed', { outcome: 'success' }),
    ];
    return Promise.resolve({ runId, events });
  }
}

function verifier(synthlab: StubSynthLab) {
  return new SynthlabRerunVerifier({
    synthlab,
    config: CONFIG,
    report: reportConfigSchema.parse({ funnel: [{ name: 'Inicio', route: '/' }] }),
    touched: (files) =>
      files.includes('routes/basket.ts') ? [{ method: 'GET', route: '/rest/basket/:id' }] : [],
  });
}

describe('SynthlabRerunVerifier (F3.5, V3)', () => {
  it('plays the image as A and the fix branch as B, and passes a fix that keeps the UX', async () => {
    const synthlab = new StubSynthLab(true, { a: 20, b: 25 });

    const result = await verifier(synthlab).verify(FIX);

    expect(synthlab.configs[0]?.variants).toEqual([
      { key: 'a', ref: 'image' },
      { key: 'b', ref: `janus/fix-${FINDING}`, repo: FIX.repo, base: FIX.base },
    ]);
    expect(result.passed).toBe(true);
    expect(result.details).toContain('success A 2/2, B 2/2');
    expect(result.details).toContain('GET /rest/basket/:id p95 20 → 25 ms');
  });

  it('fails a fix that loses the shoppers', async () => {
    const result = await verifier(new StubSynthLab(false, { a: 20, b: 20 })).verify(FIX);

    expect(result.passed).toBe(false);
    expect(result.details).toContain('success dropped 100 points');
  });

  it('fails a fix that makes a touched endpoint too slow', async () => {
    const result = await verifier(new StubSynthLab(true, { a: 20, b: 200 })).verify(FIX);

    expect(result.passed).toBe(false);
    expect(result.details).toContain('over its latency budget');
  });
});
