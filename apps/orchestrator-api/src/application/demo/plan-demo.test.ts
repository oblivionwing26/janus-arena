import { newUlid, parseEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { planDemo, type DemoStory } from './plan-demo.js';

const GATE = '01JC0F360GATE000000000000A';
const RED = '01JC0F360RED0000000000000A';
const BLUE = '01JC0F360B1E0000000000000A';
const AB = '01JC0F360AB00000000000000A';
const VARIANT = '01JC0F360VAR0000000000000A';
let clock = 0;

const event = (runId: string, seq: number, type: string, payload: unknown) =>
  parseEvent({
    id: newUlid(),
    runId,
    seq,
    ts: new Date(Date.UTC(2026, 10, 13, 10, 0, clock++)).toISOString(),
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type,
    payload,
  });
const started = (runId: string, extra: Record<string, unknown> = {}) =>
  event(runId, 0, 'run.started', { budget: { maxTokens: 1, maxEur: 1 }, ...extra });

async function store() {
  const events = new InMemoryEventStore();
  await events.append([
    started(GATE),
    event(GATE, 1, 'gate.stage', { stage: 'red-team', status: 'run', runId: RED }),
    event(GATE, 2, 'gate.stage', { stage: 'red-team', status: 'run', runId: RED }),
    event(GATE, 3, 'gate.stage', { stage: 'blue-team', status: 'run', runId: BLUE }),
    started(RED),
    event(RED, 1, 'surface.mapped', {
      side: 'variant',
      ref: 'main',
      sha: 'a'.repeat(40),
      endpoints: [],
    }),
    started(BLUE),
    event(BLUE, 1, 'patch.proposed', {
      patchId: newUlid(),
      author: 'blue-team',
      branch: `janus/fix-${newUlid()}`,
      diff: 'diff --git a/x b/x\n',
    }),
    started(AB, { variants: [{ key: 'b', ref: `janus/variant-${VARIANT}`, repo: 'file:///x' }] }),
    event(AB, 1, 'session.started', {
      variant: 'a',
      kind: 'persona',
      persona: 'carmen-retired',
      seed: 1,
      attempt: 1,
    }),
    started(VARIANT),
    event(VARIANT, 1, 'patch.proposed', {
      patchId: newUlid(),
      author: 'ui-engineer',
      branch: `janus/variant-${VARIANT}`,
      diff: 'diff --git a/y b/y\n',
    }),
  ]);
  return events;
}

const story = (id: string, kind: DemoStory['kind']): DemoStory => ({
  id,
  kind,
  title: `Story ${kind}`,
  summary: 'What happened.',
});

describe('planDemo (F3.12)', () => {
  it('brings a gate’s runs along and links the page that shows each', async () => {
    const plan = await planDemo([story(GATE, 'gate')], await store());

    expect([...plan.runs.keys()].sort()).toEqual([BLUE, GATE, RED].sort());
    expect(plan.featured[0]?.links).toEqual([
      { label: 'Replay the gate as an attack graph', href: `/runs/${GATE}/attack` },
      { label: 'The gate, stage by stage', href: `/runs/${GATE}` },
      { label: 'red-team: findings and surface', href: `/runs/${RED}/security` },
      { label: 'blue-team: the patches and their checks', href: `/runs/${BLUE}/variant` },
    ]);
  });

  it('brings an A/B’s generated variant along, with its patches page', async () => {
    const plan = await planDemo([story(AB, 'ab')], await store());

    expect([...plan.runs.keys()].sort()).toEqual([AB, VARIANT].sort());
    expect(plan.featured[0]?.links.map((link) => link.href)).toEqual([
      `/runs/${AB}/report`,
      `/runs/${AB}`,
      `/runs/${VARIANT}/variant`,
    ]);
  });

  it('links a Launch Day run to its curves and its replay, and brings nothing else along', async () => {
    const plan = await planDemo([story(AB, 'launch-day')], await store());

    expect([...plan.runs.keys()]).toEqual([AB]);
    expect(plan.featured[0]?.links.map((link) => link.href)).toEqual([
      `/runs/${AB}/launch-day`,
      `/runs/${AB}`,
    ]);
  });

  it('ships each run once, however many stories point at it', async () => {
    const plan = await planDemo([story(GATE, 'gate'), story(AB, 'ab')], await store());

    expect(plan.runs.size).toBe(5);
    expect(plan.featured.map((each) => each.runId)).toEqual([GATE, AB]);
  });

  it('refuses a run that has no events instead of shipping an empty one', async () => {
    await expect(
      planDemo([story('01JC0F360N0NE0000000000000', 'ab')], await store()),
    ).rejects.toThrow('has no events');
  });
});
