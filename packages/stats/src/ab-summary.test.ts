import { newUlid, parseEvent, type JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { abSummary } from './ab-summary.js';

const RUN = '01JC0F18STA0000000000000AA';

class Run {
  readonly events: JanusEvent[] = [];
  private seq = 0;

  private emit(agentId: string, role: string, type: string, payload: unknown): void {
    this.events.push(
      parseEvent({
        id: newUlid(),
        runId: RUN,
        seq: this.seq++,
        ts: new Date(Date.UTC(2026, 10, 6, 12, 0, this.seq)).toISOString(),
        schemaVersion: 1,
        actor: { agentId, role },
        type,
        payload,
      }) as JanusEvent,
    );
  }

  /** One slot: started, and ended with `outcome` unless it never ended. */
  session(
    persona: string,
    variant: string,
    seed: number,
    outcome: 'success' | 'abandon' | 'patience_exhausted' | 'budget_exhausted' | null,
    options: { kind?: 'persona' | 'baseline'; attempt?: number } = {},
  ): this {
    const kind = options.kind ?? 'persona';
    const attempt = options.attempt ?? 1;
    const agentId = `${persona}-${variant}-s${String(seed)}-a${String(attempt)}`;
    const role = kind === 'baseline' ? 'competent-baseline' : 'navigator';
    this.emit(agentId, role, 'session.started', { variant, kind, persona, seed, attempt });
    if (outcome !== null) {
      this.emit(agentId, role, 'session.ended', { outcome, steps: 10, durationMs: 1000 });
    }
    return this;
  }
}

describe('abSummary', () => {
  it('rates each variant with Wilson and compares the A/B pairs with the bootstrap', () => {
    const run = new Run()
      .session('ana', 'a', 1, 'success')
      .session('ana', 'b', 1, 'success')
      .session('luis', 'a', 1, 'abandon')
      .session('luis', 'b', 1, 'success')
      .session('marta', 'a', 1, 'success')
      .session('marta', 'b', 1, 'patience_exhausted')
      .session('pablo', 'a', 1, 'abandon')
      .session('pablo', 'b', 1, 'success')
      .session('competent-baseline', 'a', 1, 'success', { kind: 'baseline' })
      .session('competent-baseline', 'b', 1, 'success', { kind: 'baseline' });

    const summary = abSummary(run.events);

    expect(summary.variants.map((v) => [v.variant, v.personas?.successes, v.personas?.n])).toEqual([
      ['a', 2, 4],
      ['b', 3, 4],
    ]);
    expect(summary.variants.map((v) => v.baseline)).toEqual([
      { successes: 1, n: 1 },
      { successes: 1, n: 1 },
    ]);
    expect(summary.comparison).toMatchObject({ a: 'a', b: 'b', pairs: 4 });
    // Differences B − A: 0, +1, -1, +1.
    expect(summary.comparison?.difference?.mean).toBe(0.25);
    expect(summary.comparison?.verdict).toBe('no-detectable-difference');
  });

  it('excludes sessions that never ended or ran out of budget, and their pairs', () => {
    const run = new Run()
      .session('ana', 'a', 1, null)
      .session('ana', 'a', 1, 'success', { attempt: 2 })
      .session('ana', 'b', 1, 'success')
      .session('luis', 'a', 1, 'budget_exhausted')
      .session('luis', 'b', 1, 'success');

    const summary = abSummary(run.events);

    expect(summary.excluded).toEqual([
      { agentId: 'ana-a-s1-a1', reason: 'never ended (infrastructure)' },
      { agentId: 'luis-a-s1-a1', reason: 'run budget exhausted' },
    ]);
    expect(summary.variants.map((v) => [v.variant, v.personas?.n])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    // Only Ana is a complete pair (her retry counts); Luis has no valid A side.
    expect(summary.comparison?.pairs).toBe(1);
  });

  it('has no comparison for a single-variant run, and no rate without personas', () => {
    const run = new Run().session('competent-baseline', 'a', 1, 'success', { kind: 'baseline' });

    const summary = abSummary(run.events);

    expect(summary.variants).toEqual([
      { variant: 'a', personas: null, baseline: { successes: 1, n: 1 } },
    ]);
    expect(summary.comparison).toBeNull();
  });

  it('ignores runs from before session.started (no slots, nothing to compare)', () => {
    expect(abSummary([])).toEqual({ variants: [], comparison: null, excluded: [] });
  });
});
