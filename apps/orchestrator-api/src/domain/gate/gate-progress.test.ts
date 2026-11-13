import { describe, expect, it } from 'vitest';

import type { StoredEvent } from '../event-store/stored-event.js';
import { gateProgress } from './gate-progress.js';

const RUN_A = '01JC0F2PB7E0000000000000AA';
const RUN_B = '01JC0F2PB7E0000000000000AB';

let seq = 0;
const stage = (payload: Record<string, unknown>) =>
  ({
    id: '01JC0F2PB7E0000000000000EV',
    runId: '01JC0F2PB7E0000000000000GT',
    seq: seq++,
    ts: '2026-11-13T10:00:00.000Z',
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type: 'gate.stage',
    payload,
  }) as StoredEvent;

describe('gateProgress (F3.9)', () => {
  it('reads completed, skipped, interrupted and pending stages from the gate log', () => {
    const progress = gateProgress([
      stage({ stage: 'synthlab-a', status: 'started', allowanceEur: 0.4 }),
      stage({ stage: 'synthlab-a', status: 'run', runId: RUN_A }),
      stage({ stage: 'synthlab-a', status: 'completed', output: { runId: RUN_A }, spentEur: 0.1 }),
      stage({ stage: 'variant-b', status: 'started', allowanceEur: 0.3 }),
      stage({ stage: 'variant-b', status: 'skipped', reason: 'no UI Engineer policy' }),
      stage({ stage: 'ab', status: 'started', allowanceEur: 0.3 }),
      stage({ stage: 'ab', status: 'run', runId: RUN_B }),
    ]);

    expect(progress.get('synthlab-a')).toEqual({
      status: 'completed',
      output: { runId: RUN_A },
      runs: [RUN_A],
    });
    expect(progress.get('variant-b')).toEqual({
      status: 'skipped',
      reason: 'no UI Engineer policy',
      runs: [],
    });
    expect(progress.get('ab')).toEqual({ status: 'interrupted', runs: [RUN_B] });
    expect(progress.get('report')).toEqual({ status: 'pending', runs: [] });
  });

  it('keeps the runs of every attempt of a stage that failed and ran again', () => {
    const progress = gateProgress([
      stage({ stage: 'blue-team', status: 'started' }),
      stage({ stage: 'blue-team', status: 'run', runId: RUN_A }),
      stage({ stage: 'blue-team', status: 'failed', reason: 'out of credit' }),
      stage({ stage: 'blue-team', status: 'started' }),
      stage({ stage: 'blue-team', status: 'run', runId: RUN_B }),
    ]);

    expect(progress.get('blue-team')).toEqual({ status: 'interrupted', runs: [RUN_A, RUN_B] });
  });
});
