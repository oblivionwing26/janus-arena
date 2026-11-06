import { newUlid, parseEvent, type SynthlabReport } from '@janus/shared-kernel';
import { reportConfigSchema } from '@janus/synthlab-report';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { InMemoryArtifactStore } from '../../infrastructure/artifacts/in-memory-artifact-store.js';
import { inMemoryAdapters } from '../../test-support/in-memory-adapters.js';
import { createApp } from '../create-app.js';

const RUN_ID = '01JC0F110AP0000000000000AA';
const AGENT = 'carmen-retired-a-s1-a1';
const URL_CART = 'http://janus-r-x-a-app:3100/cart';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function events(): StoredEvent[] {
  let seq = 0;
  const event = (agentId: string, role: string, type: string, payload: unknown) =>
    parseEvent({
      id: newUlid(),
      runId: RUN_ID,
      seq: seq++,
      ts: new Date(Date.UTC(2026, 10, 6, 10, 0, seq)).toISOString(),
      schemaVersion: 1,
      actor: { agentId, role },
      type,
      payload,
    });
  const started = event(AGENT, 'navigator', 'session.started', {
    variant: 'a',
    kind: 'persona',
    persona: 'carmen-retired',
    seed: 1,
    attempt: 1,
  });
  const click = event(AGENT, 'navigator', 'agent.action', {
    stepIndex: 0,
    action: 'click',
    selector: 'role=link[name="Otras opciones"]',
    boundingBox: { x: 16, y: 500, width: 120, height: 24 },
    durationMs: 80,
    ok: true,
    domMutations: 0,
  });
  const step = event(AGENT, 'navigator', 'agent.step', {
    stepIndex: 0,
    url: URL_CART,
    durationMs: 3000,
  });
  const shot = event(AGENT, 'navigator', 'page.screenshot', {
    stepIndex: 0,
    url: URL_CART,
    artifact: `${AGENT}/step-0.png`,
    detector: 'dead-click',
  });
  const signal = event('orchestrator', 'orchestrator', 'friction.signal', {
    detector: 'dead-click',
    severity: 'low',
    evidenceEventIds: [click.id],
    agentId: AGENT,
    stepIndex: 0,
    url: URL_CART,
  });
  const ended = event(AGENT, 'navigator', 'session.ended', {
    outcome: 'abandon',
    steps: 1,
    durationMs: 3000,
  });
  return [started, click, step, shot, signal, ended];
}

describe('run report API', () => {
  let app: NestFastifyApplication;
  let artifacts: InMemoryArtifactStore;

  beforeEach(async () => {
    const adapters = inMemoryAdapters();
    artifacts = new InMemoryArtifactStore();
    await adapters.eventStore.append(events());
    await artifacts.put(RUN_ID, `${AGENT}/step-0.png`, PNG);
    app = await createApp(
      {
        ...adapters,
        artifacts,
        reports: {
          shoplab: reportConfigSchema.parse({ funnel: [{ name: 'Carrito', route: '/cart' }] }),
        },
      },
      { logger: false },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('computes the report of a run from its events', async () => {
    const response = await app.inject({ method: 'GET', url: `/runs/${RUN_ID}/report` });

    expect(response.statusCode).toBe(200);
    const report = response.json<SynthlabReport>();
    expect(report.zones).toMatchObject([
      {
        rank: 1,
        route: '/cart',
        element: 'role=link[name="Otras opciones"]',
        screenshot: { artifact: `${AGENT}/step-0.png` },
      },
    ]);
    expect(report.funnel).toMatchObject([{ variant: 'a', sessions: 1 }]);
  });

  it('answers 404 for an unknown run or target, and 400 for a bad id', async () => {
    const unknownRun = await app.inject({ method: 'GET', url: `/runs/${newUlid()}/report` });
    const unknownTarget = await app.inject({
      method: 'GET',
      url: `/runs/${RUN_ID}/report?target=juice-shop`,
    });
    const badId = await app.inject({ method: 'GET', url: '/runs/nope/report' });

    expect([unknownRun.statusCode, unknownTarget.statusCode, badId.statusCode]).toEqual([
      404, 404, 400,
    ]);
  });

  it('serves a screenshot as PNG', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/runs/${RUN_ID}/artifacts/${AGENT}/step-0.png`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(new Uint8Array(response.rawPayload)).toEqual(PNG);
  });

  it('refuses keys outside the run and anything but PNG, and 404s a missing one', async () => {
    const codes = await Promise.all(
      [
        `/runs/${RUN_ID}/artifacts/..%2F..%2F.env`,
        `/runs/${RUN_ID}/artifacts/${AGENT}/notes.txt`,
        `/runs/${RUN_ID}/artifacts/${AGENT}/STEP-0.png`,
        `/runs/${RUN_ID}/artifacts/${AGENT}/step-9.png`,
      ].map(async (url) => (await app.inject({ method: 'GET', url })).statusCode),
    );

    expect(codes).toEqual([400, 400, 400, 404]);
  });
});
