import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder, type SessionBuilder } from '../test-support/run-builder.js';

const extra = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'extra-steps');

function walk(session: SessionBuilder, steps: number, waits = 0): void {
  for (let index = 0; index < steps; index++) session.act('/', 'scroll');
  for (let index = 0; index < waits; index++) session.act('/', 'wait');
}

describe('extra-steps', () => {
  it('grades a successful persona against the competent baseline of the run', () => {
    const run = new RunBuilder();
    const baseline = run.session('competent-baseline-0', 'competent-baseline');
    walk(baseline, 10);
    const baselineEnd = baseline.end('success');
    const slow = run.session('carmen-1');
    walk(slow, 21);
    const slowEnd = slow.end('success');
    const ok = run.session('diego-2');
    walk(ok, 14);
    ok.end('success');

    expect(extra(run)).toEqual([
      {
        detector: 'extra-steps',
        severity: 'medium',
        agentId: 'carmen-1',
        evidenceEventIds: [slowEnd, baselineEnd],
      },
    ]);
  });

  it('is high at three times the baseline and low just past 1.5', () => {
    const run = new RunBuilder();
    const baseline = run.session('competent-baseline-0', 'competent-baseline');
    walk(baseline, 10);
    baseline.end('success');
    const lost = run.session('marta-1');
    walk(lost, 30);
    lost.end('success');
    const bit = run.session('pablo-2');
    walk(bit, 15);
    bit.end('success');

    expect(extra(run).map((signal) => [signal.agentId, signal.severity])).toEqual([
      ['marta-1', 'high'],
      ['pablo-2', 'low'],
    ]);
  });

  it('does not count waits as steps (a form still submitting is not friction)', () => {
    const run = new RunBuilder();
    const baseline = run.session('competent-baseline-0', 'competent-baseline');
    walk(baseline, 10);
    baseline.end('success');
    const careful = run.session('rosa-1');
    walk(careful, 12, 8);
    careful.end('success');

    expect(extra(run)).toEqual([]);
  });

  it('typical false positive: no comparison when the baseline did not succeed', () => {
    const run = new RunBuilder();
    const baseline = run.session('competent-baseline-0', 'competent-baseline');
    walk(baseline, 4);
    baseline.end('abandon', 'No encuentro el pago');
    const persona = run.session('carmen-1');
    walk(persona, 30);
    persona.end('success');

    expect(extra(run)).toEqual([]);
  });

  it('compares each persona with the baseline of its own variant (F1.7)', () => {
    const run = new RunBuilder();
    const baselineA = run.session('competent-baseline-a', 'competent-baseline');
    baselineA.started('a');
    walk(baselineA, 10);
    baselineA.end('success');
    const baselineB = run.session('competent-baseline-b', 'competent-baseline');
    baselineB.started('b');
    walk(baselineB, 20);
    baselineB.end('success');
    const personaA = run.session('carmen-a');
    personaA.started('a');
    walk(personaA, 20);
    personaA.end('success');
    const personaB = run.session('carmen-b');
    personaB.started('b');
    walk(personaB, 20);
    personaB.end('success');

    // 20 steps is twice the baseline in A, but the same as the baseline in B.
    expect(extra(run).map((signal) => [signal.agentId, signal.severity])).toEqual([
      ['carmen-a', 'medium'],
    ]);
  });

  it('only compares successful personas', () => {
    const run = new RunBuilder();
    const baseline = run.session('competent-baseline-0', 'competent-baseline');
    walk(baseline, 10);
    baseline.end('success');
    const quitter = run.session('tomas-1');
    walk(quitter, 30);
    quitter.end('abandon', 'Demasiado lento');

    expect(extra(run)).toEqual([]);
  });
});
