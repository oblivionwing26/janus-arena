// F2.4: the automatic A/B chains discovery, the UI Engineer and a paired run. SynthLab is a
// stub that serves recorded runs; model and checks are scripted. No API, no Docker.

import { readFileSync } from 'node:fs';

import { newUlid, parseEvent, parseRunExport } from '@janus/shared-kernel';
import { reportConfigSchema } from '@janus/synthlab-report';
import { describe, expect, it } from 'vitest';

import type { RunConfig } from '../domain/run/run-config.js';
import type { CompletedRun, SynthLabPort } from '../domain/run/synthlab-port.js';
import { EditPolicy } from '../domain/vcs/edit-policy.js';
import { ScriptedBuildChecks } from '../infrastructure/checks/scripted-build-checks.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../test-support/scripted-gateway.js';
import { GenerateAndCompareVariant } from './generate-and-compare-variant.js';

const REPO = 'https://github.com/example/shop.git';
const ALLOWED = ['src/app/**/page.tsx', 'src/components/**'];
const REPORT = reportConfigSchema.parse({
  routes: ['/products/:slug', '/orders/:id'],
  funnel: [{ name: 'Carrito', route: '/cart' }],
});
const CONFIG: RunConfig = {
  target: 'shoplab',
  variants: [{ key: 'a', ref: 'main' }],
  personas: ['carmen-retired'],
  seeds: [1],
  budget: { maxTokens: 1_000_000, maxEur: 1 },
};
// The probes' recorded run: its most intense zone is the cart page.
const DISCOVERY = parseRunExport(
  readFileSync(
    new URL('../../../../packages/synthlab-report/fixtures/flaw-probes-f110.json', import.meta.url),
    'utf8',
  ),
);
const SHOP = {
  'src/app/cart/page.tsx':
    'import { MoreOptions } from \'@/components/more-options\';\nexport default function Cart() {\n  return <MoreOptions label="Otras opciones" />;\n}\n',
  'src/components/more-options.tsx': 'export function MoreOptions() { return null; }\n',
};

/** Serves the probes' run as discovery, and a tiny paired run with the variants it was asked for. */
class StubSynthLab implements SynthLabPort {
  readonly configs: RunConfig[] = [];

  runAndWait(config: RunConfig): Promise<CompletedRun> {
    this.configs.push(config);
    if (config.variants.length === 1) {
      return Promise.resolve({ runId: DISCOVERY.runId, events: DISCOVERY.events });
    }
    const runId = newUlid();
    let seq = 0;
    const event = (agentId: string, type: string, payload: unknown) =>
      parseEvent({
        id: newUlid(),
        runId,
        seq: seq++,
        ts: new Date(Date.UTC(2026, 10, 7, 10, 0, seq)).toISOString(),
        schemaVersion: 1,
        actor: { agentId, role: agentId === 'orchestrator' ? 'orchestrator' : 'navigator' },
        type,
        payload,
      });
    const events = [
      event('orchestrator', 'run.started', { budget: config.budget }),
      ...config.variants.flatMap(({ key }) => [
        event(`carmen-${key}-s1-a1`, 'session.started', {
          variant: key,
          kind: 'persona',
          persona: 'carmen-retired',
          seed: 1,
          attempt: 1,
        }),
        event(`carmen-${key}-s1-a1`, 'session.ended', {
          outcome: key === 'b' ? 'success' : 'abandon',
          steps: 4,
          durationMs: 1,
        }),
      ]),
      event('orchestrator', 'run.completed', { outcome: 'success' }),
    ];
    return Promise.resolve({ runId, events });
  }
}

async function compare(replies: ScriptedReply[], options: { from?: boolean } = {}) {
  const store = new InMemoryEventStore();
  if (options.from === true) await store.append(DISCOVERY.events);
  const vcs = new InMemoryVcs({ [REPO]: { main: SHOP } });
  const synthlab = new StubSynthLab();
  const result = await new GenerateAndCompareVariant({
    synthlab,
    gateway: new ScriptedGateway(replies),
    vcs,
    store,
    checks: new ScriptedBuildChecks(vcs),
  }).execute({
    config: CONFIG,
    target: {
      repo: REPO,
      excludeFiles: [],
      policy: new EditPolicy({ allow: ALLOWED }),
      allowed: ALLOWED,
    },
    report: REPORT,
    zones: 1,
    engineerBudget: { maxTokens: 1_000_000, maxEur: 1 },
    ...(options.from === true ? { fromRunId: DISCOVERY.runId } : {}),
  });
  return { result, synthlab, vcs, store };
}

const fix: ScriptedReply[] = [
  {
    tool: 'edit_file',
    input: {
      path: 'src/app/cart/page.tsx',
      old_text: '<MoreOptions label="Otras opciones" />',
      new_text: '<h2>¿Tienes un cupón?</h2>',
    },
  },
  { tool: 'done', input: { summary: 'Coupon in sight.' } },
];

describe('GenerateAndCompareVariant', () => {
  it('discovers on A, patches the hottest zone and compares A with the generated B', async () => {
    const { result, synthlab, vcs } = await compare(fix);

    expect(result.status).toBe('compared');
    if (result.status !== 'compared') return;
    expect(synthlab.configs.map((config) => config.variants)).toEqual([
      [{ key: 'a', ref: 'main' }],
      [
        { key: 'a', ref: 'main' },
        {
          key: 'b',
          ref: `janus/variant-${result.variantRunId}`,
          repo: `file:///memory/${result.variantRunId}`,
        },
      ],
    ]);
    // Personas, seeds and budget of the run file play both runs.
    expect(synthlab.configs[1]).toMatchObject({ personas: ['carmen-retired'], seeds: [1] });
    expect(result.attempts).toMatchObject([
      { zone: 1, result: { status: 'verified', attempts: 1 } },
    ]);
    expect(result.report).toMatchObject({ runId: result.abRunId });
    expect(result.report.success.variants.map((variant) => variant.variant)).toEqual(['a', 'b']);
    const head = await vcs.head({
      id: result.variantRunId,
      path: '',
      url: '',
      baseSha: '',
    });
    expect(head.branch).toBe(result.branch);
  });

  it('runs no A/B when no zone gets a verified patch', async () => {
    const { result, synthlab, store } = await compare([
      { tool: 'done', input: { summary: 'Nothing to change.' } },
    ]);

    expect(result).toMatchObject({ status: 'no-variant', attempts: [{ zone: 1 }] });
    expect(synthlab.configs).toHaveLength(1);
    const variantRun = await store.readRun(result.variantRunId);
    expect(variantRun.at(-1)).toMatchObject({
      type: 'run.completed',
      payload: { outcome: 'error', reason: 'no verified patch' },
    });
  });

  it('reuses a recorded discovery run instead of playing one', async () => {
    const { result, synthlab } = await compare(fix, { from: true });

    expect(result).toMatchObject({ status: 'compared', discoveryRunId: DISCOVERY.runId });
    expect(synthlab.configs).toHaveLength(1);
    expect(synthlab.configs[0]?.variants).toHaveLength(2);
  });
});
