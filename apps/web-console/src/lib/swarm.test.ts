import { readFileSync } from 'node:fs';

import { parseRunExport } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { ConsoleEvent } from './console-event';
import { agentOffset, buildSwarm, layoutSwarm } from './swarm';

const RUN_ID = '01JC0F112SW0000000000000AA';
const BASE = 'http://janus-r-x-a-app:3100';
let seq = 0;

function event(agentId: string, type: string, payload: unknown): ConsoleEvent {
  seq += 1;
  return {
    id: `01JC0F112SW00000000000${String(seq).padStart(4, '0')}`,
    runId: RUN_ID,
    seq,
    ts: new Date(Date.UTC(2026, 10, 6, 10, 0, seq)).toISOString(),
    schemaVersion: 1,
    actor: { agentId, role: agentId === 'orchestrator' ? 'orchestrator' : 'navigator' },
    type,
    payload,
  } as ConsoleEvent;
}

function walk(agentId: string, variant: string, paths: string[]): ConsoleEvent[] {
  return [
    event(agentId, 'session.started', { variant, kind: 'persona', seed: 1, attempt: 1 }),
    ...paths.map((path, stepIndex) =>
      event(agentId, 'agent.step', { stepIndex, url: BASE + path, durationMs: 3000 }),
    ),
  ];
}

describe('buildSwarm', () => {
  it('turns visited routes into nodes, transitions into edges and puts agents on their route', () => {
    const events = [
      ...walk('carmen-a-s1-a1', 'a', ['/', '/products/taza', '/cart', '/checkout', '/cart']),
      ...walk('diego-b-s1-a1', 'b', ['/', '/orders/6']),
      event('carmen-a-s1-a1', 'session.ended', { outcome: 'abandon', steps: 5, durationMs: 1 }),
      event('diego-b-s1-a1', 'session.ended', { outcome: 'success', steps: 2, durationMs: 1 }),
    ];

    const swarm = buildSwarm(events);

    expect(swarm.nodes).toEqual([
      { route: '/', visits: 2 },
      { route: '/cart', visits: 2 },
      { route: '/checkout', visits: 1 },
      { route: '/orders/:id', visits: 1 },
      { route: '/products/taza', visits: 1 },
    ]);
    expect(swarm.edges).toContainEqual({ from: '/cart', to: '/checkout', count: 1 });
    expect(swarm.edges).toContainEqual({ from: '/checkout', to: '/cart', count: 1 });
    expect(swarm.agents).toEqual([
      { agentId: 'carmen-a-s1-a1', variant: 'a', route: '/cart', status: 'abandon', steps: 5 },
      { agentId: 'diego-b-s1-a1', variant: 'b', route: '/orders/:id', status: 'success', steps: 2 },
    ]);
  });

  it('shows an agent only once it has a page, and as navigating until it ends', () => {
    const started = walk('rosa-a-s1-a1', 'a', []);
    const steps = walk('rosa-a-s1-a1', 'a', ['/']).slice(1);

    expect(buildSwarm(started).agents).toEqual([]);
    expect(buildSwarm([...started, ...steps]).agents[0]?.status).toBe('navigating');
  });

  it('pulses a signal as soon as its step is visible, even before the signal itself', () => {
    const steps = walk('javier-a-s1-a1', 'a', ['/', '/checkout', '/cart']);
    const signal = event('orchestrator', 'friction.signal', {
      detector: 'backtrack',
      severity: 'low',
      evidenceEventIds: [steps[2]?.id],
      agentId: 'javier-a-s1-a1',
      stepIndex: 2,
      url: `${BASE}/cart`,
    });
    const all = [...steps, signal];

    // Replay: the signal is known (recorded) but the cursor has not reached step 2 yet.
    expect(buildSwarm(steps.slice(0, 3), all).pulses).toEqual([]);
    // Replay: the cursor is on step 2, the signal is still ahead.
    expect(buildSwarm(steps, all).pulses).toEqual([
      { id: signal.id, agentId: 'javier-a-s1-a1', route: '/cart', detector: 'backtrack' },
    ]);
    // Live: the signal arrives at the end of the run.
    expect(buildSwarm(all).pulses).toHaveLength(1);
  });

  it('keeps going over unknown event types', () => {
    const events = [
      ...walk('pablo-a-s1-a1', 'a', ['/']),
      event('pablo-a-s1-a1', 'agent.dreamed', { anything: true }),
    ];

    expect(buildSwarm(events).agents).toHaveLength(1);
  });

  it('replays the whole F1.11 A/B quickly enough to run on every cursor move', () => {
    const { events } = parseRunExport(
      readFileSync(
        new URL('../../../../recordings/fixtures/runs/ab-f111.json', import.meta.url),
        'utf8',
      ),
    );
    const started = performance.now();
    let last = buildSwarm([], events);
    for (let cursor = 0; cursor <= events.length; cursor += 100) {
      last = buildSwarm(events.slice(0, cursor), events);
    }
    last = buildSwarm(events, events);
    const perBuild = (performance.now() - started) / Math.ceil(events.length / 100);

    expect(last.agents).toHaveLength(37);
    expect(last.pulses.length).toBeGreaterThan(0);
    expect(perBuild).toBeLessThan(20);
  });
});

describe('layoutSwarm', () => {
  const model = buildSwarm([
    ...walk('carmen-a-s1-a1', 'a', ['/', '/products/taza', '/cart', '/checkout']),
    ...walk('diego-a-s1-a1', 'a', ['/', '/login', '/products/taza']),
  ]);

  it('puts routes in columns by distance from the home page, deterministically', () => {
    const positions = layoutSwarm(model, { width: 500, height: 300 });

    expect(positions.get('/')).toEqual({ x: 63, y: 150 });
    expect(positions.get('/products/taza')?.x).toBe(positions.get('/login')?.x);
    expect(positions.get('/cart')?.x).toBeGreaterThan(positions.get('/products/taza')?.x ?? 0);
    expect(positions.get('/checkout')?.x).toBeGreaterThan(positions.get('/cart')?.x ?? 0);
    expect(layoutSwarm(model, { width: 500, height: 300 })).toEqual(positions);
  });
});

describe('agentOffset', () => {
  it('is stable per agent and stays within the radius', () => {
    const offset = agentOffset('carmen-a-s1-a1', 20);

    expect(agentOffset('carmen-a-s1-a1', 20)).toEqual(offset);
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(20);
    expect(agentOffset('diego-a-s1-a1', 20)).not.toEqual(offset);
  });
});

describe('buildSwarm: saboteurs (F4.1)', () => {
  const saboteur = (agentId: string, variant: string, statuses: (number | null)[]) => [
    event(agentId, 'session.started', {
      variant,
      kind: 'saboteur',
      seed: 0,
      attempt: 1,
      role: 'saboteur',
      client: '10.99.0.1',
    }),
    ...statuses.map((status, index) =>
      event(agentId, 'attack.attempt', {
        attemptId: `01JC0F112SW00000000000${String(index).padStart(4, '9')}`,
        number: index + 1,
        testType: 'saturation',
        as: 'anonymous',
        method: 'POST',
        path: '/api/auth/logout',
        status,
        bytes: 2,
      }),
    ),
  ];

  it('keeps them off the route graph and counts what the shop answered and refused', () => {
    const events = [
      ...walk('carmen-a-s1-a1', 'a', ['/', '/cart']),
      ...saboteur('saboteur-b-s0-a1', 'b', [200, 200, 429, 429, 503, null]),
    ];

    const model = buildSwarm(events);

    expect(model.agents.map((agent) => agent.agentId)).toEqual(['carmen-a-s1-a1']);
    expect(model.nodes.map((node) => node.route)).toEqual(['/', '/cart']);
    expect(model.saboteurs).toEqual([
      {
        agentId: 'saboteur-b-s0-a1',
        variant: 'b',
        client: '10.99.0.1',
        answered: 2,
        refused: 3,
        done: false,
      },
    ]);
  });

  it('marks a saboteur done when its session ends, and shows only what the cursor has reached', () => {
    const events = [
      ...saboteur('saboteur-a-s0-a1', 'a', [200, 200, 200]),
      event('saboteur-a-s0-a1', 'session.ended', { outcome: 'success', steps: 3, durationMs: 1 }),
    ];

    expect(buildSwarm(events).saboteurs[0]).toMatchObject({ answered: 3, done: true });
    expect(buildSwarm(events.slice(0, 3)).saboteurs[0]).toMatchObject({
      answered: 2,
      done: false,
    });
    expect(buildSwarm([]).saboteurs).toEqual([]);
  });
});
