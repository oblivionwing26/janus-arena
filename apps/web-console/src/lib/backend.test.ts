import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseRunExport } from '@janus/shared-kernel';
import { buildSynthlabReport, reportConfigSchema } from '@janus/synthlab-report';
import { describe, expect, it } from 'vitest';

import {
  fetchDemoIndex,
  fetchPoc,
  fetchReport,
  listRuns,
  targetOf,
  type DemoIndex,
} from './backend';
import { fetchRunEvents } from './run-events';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('../../../../recordings/fixtures/runs/ab-f111.json', import.meta.url)),
  'utf8',
);
const RUN = parseRunExport(FIXTURE);
const CONFIG = reportConfigSchema.parse({
  funnel: [
    { name: 'Carrito', route: '/cart' },
    { name: 'Pago', route: '/checkout' },
  ],
});
const INDEX: DemoIndex = {
  generatedAt: '2026-11-13T12:00:00.000Z',
  featured: [
    {
      runId: RUN.runId,
      title: 'A/B on ShopLab',
      summary: 'Variant B against A.',
      links: [{ label: 'Report', href: `/runs/${RUN.runId}/report` }],
    },
  ],
  runs: [
    {
      runId: RUN.runId,
      startedAt: '2026-11-06T15:12:18.615Z',
      eventCount: RUN.events.length,
      status: 'completed',
      outcome: 'success',
      reason: null,
    },
  ],
  reports: { shoplab: CONFIG },
};

/** The demo folder as a static host serves it, recording what was asked for. */
function demoHost() {
  const asked: string[] = [];
  const pocs = new Map([
    [
      '/demo/pocs/01JC0F350RUN0000000000000A/01JC0F350F1ND0000000000000.json',
      {
        version: 1,
        target: 'juice-shop',
        class: 'idor',
        oracle: 'canary-leak',
        endpoint: 'GET /rest/basket/:id',
        steps: {
          kind: 'idor',
          method: 'GET',
          route: '/rest/basket/:id',
          bind: { victim: 'basketId' },
        },
      },
    ],
  ]);
  const fetchImpl: typeof fetch = (input) => {
    const path = String(input);
    asked.push(path);
    if (path === '/demo/index.json') return Promise.resolve(Response.json(INDEX));
    if (path === `/demo/runs/${RUN.runId}.json`) return Promise.resolve(new Response(FIXTURE));
    const poc = pocs.get(path);
    if (poc !== undefined) return Promise.resolve(Response.json(poc));
    return Promise.resolve(new Response('', { status: 404 }));
  };
  return { fetchImpl, asked };
}

describe('the console backend layer (F3.12)', () => {
  it('reads a run from the demo folder, validating it as any exported run is', async () => {
    const { fetchImpl, asked } = demoHost();

    const events = await fetchRunEvents(RUN.runId, fetchImpl, { demo: true });

    expect(events).toHaveLength(RUN.events.length);
    expect(asked).toEqual([`/demo/runs/${RUN.runId}.json`]);
  });

  it('says plainly when a run is not in the demo', async () => {
    const { fetchImpl } = demoHost();

    await expect(
      fetchRunEvents('01JC0F350NOPE0000000000000', fetchImpl, { demo: true }),
    ).rejects.toThrow(/no está en la demo/);
  });

  it('lists the demo’s runs and its featured stories from the index', async () => {
    const { fetchImpl } = demoHost();

    const runs = await listRuns({ demo: true, fetchImpl });
    const index = await fetchDemoIndex({ demo: true, fetchImpl });

    expect(runs.map((run) => run.runId)).toEqual([RUN.runId]);
    expect(index.featured[0]?.title).toBe('A/B on ShopLab');
  });

  it('computes the report in the browser with the same function the orchestrator uses', async () => {
    const { fetchImpl, asked } = demoHost();

    const report = await fetchReport(RUN.runId, { demo: true, fetchImpl });

    expect(report).toEqual(buildSynthlabReport(RUN.runId, RUN.events, CONFIG));
    expect(asked.every((path) => path.startsWith('/demo/'))).toBe(true);
    expect(asked.some((path) => path.includes('orchestrator'))).toBe(false);
  });

  it('reads the target a run recorded, ShopLab for runs from before targets', () => {
    expect(targetOf(RUN.events)).toBe('shoplab');
    expect(targetOf([])).toBe('shoplab');
  });

  it('serves a PoC from the demo folder, schema-validated', async () => {
    const { fetchImpl } = demoHost();

    const poc = await fetchPoc('01JC0F350RUN0000000000000A', '01JC0F350F1ND0000000000000', {
      demo: true,
      fetchImpl,
    });

    expect(poc).toMatchObject({ class: 'idor', endpoint: 'GET /rest/basket/:id' });
    await expect(
      fetchPoc('01JC0F350RUN0000000000000A', '01JC0F350M1SS0000000000000', {
        demo: true,
        fetchImpl,
      }),
    ).rejects.toThrow();
  });

  it('asks the orchestrator, through the console’s own origin, when it is not a demo', async () => {
    const asked: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      asked.push(String(input));
      return Promise.resolve(Response.json({ runs: [] }));
    };

    await listRuns({ demo: false, fetchImpl });
    await fetchPoc('01JC0F350RUN0000000000000A', '01JC0F350F1ND0000000000000', {
      demo: false,
      fetchImpl,
    }).catch(() => undefined);

    expect(asked).toEqual([
      '/api/orchestrator/runs',
      '/api/orchestrator/runs/01JC0F350RUN0000000000000A/pocs/01JC0F350F1ND0000000000000',
    ]);
  });
});
