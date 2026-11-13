import {
  GATE_STAGES,
  isKnownEvent,
  newUlid,
  type GateStageName,
  type GateStageOutput,
} from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { GateBudget } from '../../domain/gate/gate-budget.js';
import type {
  GateStage,
  GateStageContext,
  GateStageResult,
} from '../../domain/gate/gate-stage-port.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { RunEventRecorder } from '../run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../start-run.js';
import { RunJanusGate } from './run-janus-gate.js';

/** A store that stops accepting events once the process "dies", like a killed gate. */
class DyingStore extends InMemoryEventStore {
  dead = false;
  override async append(events: readonly StoredEvent[]): Promise<void> {
    if (this.dead) throw new Error('killed');
    await super.append(events);
  }
}

class Killed extends Error {}

/** A stage that starts one run costing `eur`, hands on its output, and counts its calls. */
class FakeStage implements GateStage {
  calls = 0;
  contexts: GateStageContext[] = [];
  kill = false;
  skip: string | undefined;
  readonly resumesRuns: boolean;

  constructor(
    readonly name: GateStageName,
    private readonly store: DyingStore,
    private readonly eur = 0,
    options: { resumesRuns?: boolean } = {},
  ) {
    this.resumesRuns = options.resumesRuns ?? false;
  }

  async run(context: GateStageContext): Promise<GateStageResult> {
    this.calls += 1;
    this.contexts.push(context);
    if (this.skip !== undefined) return { status: 'skipped', reason: this.skip };
    const runId =
      context.interrupted[0] !== undefined && this.resumesRuns ? context.interrupted[0] : newUlid();
    await context.onRun(runId);
    const recorder = new RunEventRecorder(this.store, runId, ORCHESTRATOR_ACTOR, {
      startSeq: (await this.store.readRun(runId)).length,
    });
    if ((await this.store.readRun(runId)).length === 0) {
      await recorder.record('run.started', { budget: { maxTokens: 1000, maxEur: 1 } });
    }
    if (this.kill) {
      this.store.dead = true;
      throw new Killed('the process was killed');
    }
    if (this.eur > 0) {
      await recorder.record(
        'llm.call',
        { role: 'blue-team', model: 'claude-sonnet-5-5', durationMs: 10, requestHash: 'sha256:x' },
        {
          cost: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            estimatedEur: this.eur,
          },
        },
      );
    }
    await recorder.record('run.completed', { outcome: 'success' });
    const previous: GateStageOutput = Object.fromEntries(
      [...context.outputs.entries()].map(([stage]) => [`saw${stage.replace(/-/g, '')}`, true]),
    );
    return { status: 'completed', output: { runId, ...previous } };
  }
}

function setup(costs: Partial<Record<GateStageName, number>> = {}) {
  const store = new DyingStore();
  const stages = Object.fromEntries(
    GATE_STAGES.map((name) => [
      name,
      new FakeStage(name, store, costs[name] ?? 0, { resumesRuns: name === 'ab' }),
    ]),
  ) as Record<GateStageName, FakeStage>;
  const gate = new RunJanusGate({ store, stages: GATE_STAGES.map((name) => stages[name]) });
  const budget = new GateBudget(2, { 'synthlab-a': 0.2, ab: 0.3, 'blue-team': 0.5 });
  return { store, stages, gate, budget };
}

const stageEvents = (events: readonly StoredEvent[]) =>
  events
    .filter(isKnownEvent)
    .flatMap((event) =>
      event.type === 'gate.stage' ? [`${event.payload.stage}:${event.payload.status}`] : [],
    );

describe('RunJanusGate (F3.9)', () => {
  it('runs every stage in order and hands each the outputs of the earlier ones', async () => {
    const { store, stages, gate, budget } = setup();

    const result = await gate.execute({ target: 'juice-shop', budget });

    expect(result.stages.map((each) => each.status)).toEqual(GATE_STAGES.map(() => 'completed'));
    expect([...(stages.report.contexts[0]?.outputs.keys() ?? [])]).toEqual(
      GATE_STAGES.slice(0, GATE_STAGES.indexOf('report')),
    );
    const events = await store.readRun(result.gateRunId);
    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.completed');
  });

  it('resumes a gate killed in the Blue Team without repeating the stages before it', async () => {
    const { store, stages, gate, budget } = setup({ 'synthlab-a': 0.1, 'blue-team': 0.3 });
    stages['blue-team'].kill = true;

    await expect(gate.execute({ target: 'juice-shop', budget })).rejects.toThrow('killed');
    const gateRunId = stages['blue-team'].contexts[0]?.gateRunId ?? '';
    const events = await store.readRun(gateRunId);
    // Killed: the stage never got to say it failed, and the gate never finished.
    expect(stageEvents(events).at(-1)).toBe('blue-team:run');
    expect(events.some((event) => event.type === 'run.completed')).toBe(false);

    store.dead = false;
    stages['blue-team'].kill = false;
    const resumed = await gate.execute({ target: 'juice-shop', budget, gateRunId });

    for (const name of GATE_STAGES.slice(0, GATE_STAGES.indexOf('blue-team'))) {
      expect(stages[name].calls, name).toBe(1);
    }
    expect(stages['blue-team'].calls).toBe(2);
    expect(stages.report.calls).toBe(1);
    expect(resumed.stages.map((each) => each.status)).toEqual([
      ...GATE_STAGES.slice(0, 5).map(() => 'reused'),
      'completed',
      'completed',
      'completed',
    ]);
    // The recorded outputs are handed on as if nothing had happened.
    expect(stages['blue-team'].contexts[1]?.outputs.get('red-team')).toEqual(
      expect.objectContaining({ runId: expect.any(String) as string }),
    );
    // The run the killed attempt left open is closed as interrupted.
    const [interrupted] = stages['blue-team'].contexts[1]?.interrupted ?? [];
    if (interrupted === undefined) throw new Error('the killed run was not handed on');
    const closed = (await store.readRun(interrupted)).filter(isKnownEvent).at(-1);
    expect(closed).toMatchObject({ type: 'run.completed', payload: { outcome: 'error' } });
    expect(resumed.spentEur).toBeCloseTo(0.4);
  });

  it('waits for the runs of a stage that resumes them instead of closing them', async () => {
    const { store, stages, gate, budget } = setup();
    stages.ab.kill = true;
    await gate.execute({ target: 'shoplab', budget }).catch(() => undefined);
    const gateRunId = stages.ab.contexts[0]?.gateRunId ?? '';
    store.dead = false;
    stages.ab.kill = false;

    await gate.execute({ target: 'shoplab', budget, gateRunId });

    const [first] = stages.ab.contexts[1]?.interrupted ?? [];
    expect(first).toBeDefined();
    // Not closed by the gate: the stage adopted it and finished it itself.
    const ends = (await store.readRun(first ?? '')).filter((e) => e.type === 'run.completed');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ payload: { outcome: 'success' } });
  });

  it('records a skipped stage with its reason and does not run it again on resume', async () => {
    const { store, stages, gate, budget } = setup();
    stages['variant-b'].skip = 'juice-shop declares no UI Engineer policy';
    stages.report.kill = true;
    await gate.execute({ target: 'juice-shop', budget }).catch(() => undefined);
    const gateRunId = stages.report.contexts[0]?.gateRunId ?? '';
    store.dead = false;
    stages.report.kill = false;

    await gate.execute({ target: 'juice-shop', budget, gateRunId });

    expect(stages['variant-b'].calls).toBe(1);
    expect(stageEvents(await store.readRun(gateRunId))).toContain('variant-b:skipped');
    expect(stages.ab.contexts[0]?.outputs.has('variant-b')).toBe(false);
  });

  it('gives each stage its share of the budget plus what the earlier ones left', async () => {
    const { stages, gate, budget } = setup({ 'synthlab-a': 0.1, ab: 0.2 });

    await gate.execute({ target: 'shoplab', budget });

    expect(stages['synthlab-a'].contexts[0]?.allowanceEur).toBeCloseTo(0.4);
    // synthlab-a left 0.3 of its 0.4; ab adds its 0.6.
    expect(stages.ab.contexts[0]?.allowanceEur).toBeCloseTo(0.9);
    // Blue Team: its 1.0 plus the 0.7 left by the stages before it.
    expect(stages['blue-team'].contexts[0]?.allowanceEur).toBeCloseTo(1.7);
  });

  it('records a stage that fails and lets the gate be resumed from it', async () => {
    const { store, stages, gate, budget } = setup();
    const failing: GateStage = {
      name: 'audit',
      run: () => Promise.reject(new Error('semgrep is not installed')),
    };
    const broken = new RunJanusGate({
      store,
      stages: GATE_STAGES.map((name) => (name === 'audit' ? failing : stages[name])),
    });

    await expect(broken.execute({ target: 'shoplab', budget })).rejects.toThrow('semgrep');
    const gateRunId = stages['synthlab-a'].contexts[0]?.gateRunId ?? '';
    expect(stageEvents(await store.readRun(gateRunId))).toContain('audit:failed');

    await gate.execute({ target: 'shoplab', budget, gateRunId });
    expect(stages.audit.calls).toBe(1);
    expect(stages['synthlab-a'].calls).toBe(1);
  });

  it('refuses to resume a gate that finished or does not exist', async () => {
    const { gate, budget } = setup();
    const { gateRunId } = await gate.execute({ target: 'shoplab', budget });

    await expect(gate.execute({ target: 'shoplab', budget, gateRunId })).rejects.toThrow(
      'already finished',
    );
    await expect(gate.execute({ target: 'shoplab', budget, gateRunId: newUlid() })).rejects.toThrow(
      'no events',
    );
  });
});
