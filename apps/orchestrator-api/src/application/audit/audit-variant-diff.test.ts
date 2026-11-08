// F2.7: the differential audit with fake tools that read the workspace through the VCS, so A
// and B differ only by their files. No Docker, no network.

import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { StaticAnalysisPort } from '../../domain/analysis/static-analysis-port.js';
import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { AttackSurfacePort } from '../../domain/surface/attack-surface-port.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import type { VcsPort } from '../../domain/vcs/vcs-port.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { AuditVariantDiff } from './audit-variant-diff.js';

const RUN_ID = '01JC0F27AVD0000000000000AA';
const REPO = 'https://example.com/shop.git';
const VARIANT = 'janus/variant-01JC0F27AVD0000000000000AB';

/** A Semgrep stand-in: one high finding per line calling eval. */
const evalTool = (vcs: VcsPort): StaticAnalysisPort => ({
  run: async (workspace) => {
    const findings: StaticFinding[] = [];
    for (const file of await vcs.listFiles(workspace)) {
      (await vcs.readFile(workspace, file)).split('\n').forEach((line, index) => {
        if (line.includes('eval(')) {
          findings.push({
            kind: 'static',
            tool: 'semgrep',
            rule: 'janus.eval',
            severity: 'high',
            message: 'eval',
            file,
            line: index + 1,
            snippet: line,
          });
        }
      });
    }
    return findings;
  },
});

/** A surface stand-in: `routes.txt` lines `METHOD /route auth owner`. */
const routesFile = (vcs: VcsPort): AttackSurfacePort => ({
  map: async (workspace) =>
    (await vcs.readFile(workspace, 'routes.txt'))
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line): Endpoint => {
        const [method = 'GET', route = '/', auth = 'no', owner = 'unknown'] = line.split(' ');
        return {
          route,
          method: method as Endpoint['method'],
          declaredAt: { file: 'routes.txt', line: 1 },
          handler: null,
          params: [],
          auth: auth === 'yes',
          ownerCheck: owner === 'unknown' ? 'unknown' : owner === 'yes',
        };
      }),
});

async function audit(variantFiles: Record<string, string>) {
  const base = {
    'src/app.ts': 'export const a = 1;\nconst legacy = eval(code);\n',
    'routes.txt': 'GET /api/orders/:id yes yes\n',
  };
  const vcs = new InMemoryVcs({ [REPO]: { main: base, [VARIANT]: variantFiles } });
  const store = new InMemoryEventStore();
  const result = await new AuditVariantDiff({
    vcs,
    tools: [evalTool(vcs)],
    surface: routesFile(vcs),
    store,
  }).execute({ runId: RUN_ID, repo: REPO, base: { ref: 'main' }, variant: { ref: VARIANT } });
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  return { result, events };
}

describe('AuditVariantDiff', () => {
  it('blocks a B that introduces an IDOR lead and a high finding, and records why', async () => {
    const { result, events } = await audit({
      // The old eval only moved down a line: not introduced. The new one is.
      'src/app.ts': 'export const a = 1;\n\nconst legacy = eval(code);\nconst x = eval(input);\n',
      'routes.txt': 'GET /api/orders/:id yes yes\nGET /api/orders/:id/invoice yes no\n',
    });

    expect(result.findings.map((finding) => finding.line)).toEqual([4]);
    expect(result.endpoints.map((change) => change.change)).toEqual(['new-idor-lead']);
    expect(result.verdict).toMatchObject({ blocked: true, high: 2, critical: 0 });
    expect(result.base.sha).not.toBe(result.variant.sha);

    const created = events.flatMap((event) =>
      event.type === 'finding.created' ? [event.payload.title] : [],
    );
    expect(
      events.flatMap((event) =>
        event.type === 'finding.created' ? [[event.payload.tool, event.payload.rule]] : [],
      ),
    ).toEqual([
      ['semgrep', 'janus.eval'],
      ['surface-map', 'new-idor-lead'],
    ]);
    expect(created).toEqual([
      'B introduces semgrep: janus.eval at src/app.ts:4',
      'B introduces GET /api/orders/:id/invoice: new endpoint with a session but no owner check (IDOR lead)',
    ]);
    const completed = events.find((event) => event.type === 'audit.completed');
    expect(completed?.payload).toMatchObject({
      base: { ref: 'main' },
      variant: { ref: VARIANT },
      introduced: { findings: 1, endpoints: 1, high: 2, critical: 0 },
      blocked: true,
    });
  });

  it('lets a harmless B pass, with nothing recorded but both surfaces and the verdict', async () => {
    const { result, events } = await audit({
      'src/app.ts': 'export const a = 2;\nconst legacy = eval(code);\n',
      'routes.txt': 'GET /api/orders/:id yes yes\n',
    });

    expect(result.verdict).toEqual({ blocked: false, high: 0, critical: 0, reasons: [] });
    expect(events.map((event) => event.type)).toEqual([
      'surface.mapped',
      'surface.mapped',
      'audit.completed',
    ]);
    const surfaces = events.flatMap((event) =>
      event.type === 'surface.mapped' ? [event.payload] : [],
    );
    expect(surfaces.map((surface) => [surface.side, surface.endpoints.length])).toEqual([
      ['base', 1],
      ['variant', 1],
    ]);
  });
});
