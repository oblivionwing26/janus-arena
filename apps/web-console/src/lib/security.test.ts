import { newUlid, parseEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { ConsoleEvent } from './console-event';
import { fetchRunEvents } from './run-events';
import {
  auditVerdict,
  filterFindings,
  findingRows,
  surfaceRows,
  surfaces,
  type SurfaceSide,
} from './security';
import { diffLines, variantPatches, variantRunOf } from './variant';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const VARIANT_RUN = '01JC0F28VRN0000000000000AA';
let seq = 0;
const event = (type: string, payload: unknown): ConsoleEvent =>
  parseEvent({
    id: newUlid(),
    runId: RUN_ID,
    seq: seq++,
    ts: new Date(Date.UTC(2026, 10, 8, 10, 0, seq)).toISOString(),
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type,
    payload,
  });

const finding = (severity: string, extra: Record<string, unknown> = {}) =>
  event('finding.created', {
    findingId: newUlid(),
    kind: 'static',
    severity,
    title: `a ${severity} finding`,
    status: 'suspected',
    ...extra,
  });

describe('findingRows and filterFindings', () => {
  const rows = findingRows([
    finding('medium', { tool: 'semgrep', rule: 'janus.dom-inner-html', file: 'src/a.ts', line: 3 }),
    finding('high', { tool: 'surface-map', rule: 'new-idor-lead', file: 'src/b.ts', line: 1 }),
    finding('critical', { tool: 'gitleaks', rule: 'generic-api-key', file: 'src/c.ts', line: 0 }),
    // Recorded before F2.8: no tool or place.
    finding('low'),
  ]);

  it('sorts by severity and keeps tool, rule and place', () => {
    expect(rows.map((row) => [row.severity, row.tool, row.where])).toEqual([
      ['critical', 'gitleaks', 'src/c.ts'],
      ['high', 'surface-map', 'src/b.ts:1'],
      ['medium', 'semgrep', 'src/a.ts:3'],
      ['low', '—', ''],
    ]);
  });

  it('filters by tool and severity, an empty selection meaning all', () => {
    const pick = (tools: string[], severities: string[]) =>
      filterFindings(rows, {
        tools: new Set(tools),
        severities: new Set(severities) as never,
      }).map((row) => row.tool);

    expect(pick([], [])).toHaveLength(4);
    expect(pick(['semgrep', 'gitleaks'], [])).toEqual(['gitleaks', 'semgrep']);
    expect(pick([], ['high', 'critical'])).toEqual(['gitleaks', 'surface-map']);
    expect(pick(['semgrep'], ['high'])).toEqual([]);
  });
});

describe('surfaceRows', () => {
  const side: SurfaceSide = {
    side: 'variant',
    ref: 'janus/variant-x',
    sha: 'b'.repeat(40),
    endpoints: [
      {
        method: 'GET',
        route: '/api/products',
        auth: false,
        ownerCheck: 'unknown',
        params: [],
        file: 'a',
        line: 1,
      },
      {
        method: 'GET',
        route: '/api/orders/:id',
        auth: true,
        ownerCheck: true,
        params: ['id'],
        file: 'b',
        line: 1,
      },
      {
        method: 'GET',
        route: '/api/orders/:id/invoice',
        auth: true,
        ownerCheck: false,
        params: ['id'],
        file: 'c',
        line: 1,
      },
    ],
  };

  it('puts IDOR leads first and marks them', () => {
    const rows = surfaceRows(side, { auth: 'all', owner: 'all' });

    expect(rows.map((row) => [row.route, row.idorLead])).toEqual([
      ['/api/orders/:id/invoice', true],
      ['/api/orders/:id', false],
      ['/api/products', false],
    ]);
  });

  it('filters by auth and by owner check', () => {
    expect(surfaceRows(side, { auth: 'no', owner: 'all' }).map((row) => row.route)).toEqual([
      '/api/products',
    ]);
    expect(surfaceRows(side, { auth: 'all', owner: 'yes' }).map((row) => row.route)).toEqual([
      '/api/orders/:id',
    ]);
    expect(surfaceRows(side, { auth: 'yes', owner: 'unknown' })).toEqual([]);
  });

  it('reads the maps and the verdict from the events', () => {
    const events = [
      event('surface.mapped', side),
      event('audit.completed', {
        base: { ref: 'main', sha: 'a'.repeat(40) },
        variant: { ref: 'janus/variant-x', sha: 'b'.repeat(40) },
        introduced: { findings: 0, endpoints: 1, high: 1, critical: 0 },
        blocked: true,
        reasons: ['GET /api/orders/:id/invoice: IDOR lead (high)'],
      }),
    ];

    expect(surfaces(events).map((map) => map.side)).toEqual(['variant']);
    expect(auditVerdict(events)?.blocked).toBe(true);
    expect(auditVerdict([])).toBeNull();
  });
});

describe('diffLines', () => {
  it('numbers context, removed and added lines from the hunk header', () => {
    const lines = diffLines(
      [
        'diff --git a/src/app/cart/page.tsx b/src/app/cart/page.tsx',
        '--- a/src/app/cart/page.tsx',
        '+++ b/src/app/cart/page.tsx',
        '@@ -10,3 +10,3 @@',
        ' <h1>Carrito</h1>',
        '-<a>Otras opciones</a>',
        '+<h2>¿Tienes un cupón?</h2>',
        ' </main>',
        '',
      ].join('\r\n'),
    );

    expect(lines.map((line) => [line.kind, line.oldLine, line.newLine, line.text])).toEqual([
      ['file', null, null, 'src/app/cart/page.tsx'],
      ['meta', null, null, '--- a/src/app/cart/page.tsx'],
      ['meta', null, null, '+++ b/src/app/cart/page.tsx'],
      ['hunk', null, null, '@@ -10,3 +10,3 @@'],
      ['context', 10, 10, '<h1>Carrito</h1>'],
      ['remove', 11, null, '<a>Otras opciones</a>'],
      ['add', null, 11, '<h2>¿Tienes un cupón?</h2>'],
      ['context', 12, 12, '</main>'],
    ]);
  });
});

describe('variantRunOf and variantPatches', () => {
  it('finds the UI Engineer run from a generated variant branch, not from hand-made ones', () => {
    const started = (refs: string[]) =>
      event('run.started', {
        budget: { maxTokens: 1, maxEur: 1 },
        variants: refs.map((ref, index) => ({ key: index === 0 ? 'a' : 'b', ref })),
      });

    expect(variantRunOf([started(['main', `janus/variant-${VARIANT_RUN}`])])).toBe(VARIANT_RUN);
    expect(variantRunOf([started(['main', 'variant/manual-b'])])).toBeNull();
    expect(
      variantRunOf([event('run.started', { budget: { maxTokens: 1, maxEur: 1 } })]),
    ).toBeNull();
  });

  it('pairs each patch with its verifications', () => {
    const patchId = newUlid();
    const patches = variantPatches([
      event('patch.proposed', {
        patchId,
        author: 'ui-engineer',
        branch: `janus/variant-${VARIANT_RUN}`,
        diff: '--- a/x\n+++ b/x\n',
        summary: 'Coupon field in sight.',
      }),
      event('verification.result', {
        patchId,
        verifier: 'build-checks',
        passed: false,
        details: 'TS2304',
      }),
      event('verification.result', { patchId: newUlid(), verifier: 'build-checks', passed: true }),
    ]);

    expect(patches).toMatchObject([
      {
        patchId,
        summary: 'Coupon field in sight.',
        checks: [{ verifier: 'build-checks', passed: false, details: 'TS2304' }],
      },
    ]);
  });
});

describe('fetchRunEvents', () => {
  it('reads the replay stream and skips what does not parse', async () => {
    const valid = finding('high');
    const body = `event: finding.created\ndata: ${JSON.stringify(valid)}\n\nevent: x\ndata: {"broken":true}\n\n`;

    const events = await fetchRunEvents(RUN_ID, () =>
      Promise.resolve(new Response(body, { status: 200 })),
    );

    expect(events.map((each) => each.id)).toEqual([valid.id]);
  });
});
