// F2.3-A: the UI Engineer's limits are enforced by code, whatever the model asks for. A scripted
// gateway plays the model; the workspace is the in-memory VCS. No API calls.

import { isKnownEvent, type FrictionZone } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { GenerateVariantPatch } from './generate-variant-patch.js';
import { MAX_TURNS } from './ui-engineer-agent.js';

const RUN_ID = '01JC0F23AGT0000000000000AA';
const URL = 'file:///fixtures/shop';
const ALLOWED = ['src/app/**/page.tsx', 'src/app/**/*.css', 'src/components/**'];
const POLICY = new EditPolicy({ allow: ALLOWED, deny: ['src/app/api/**'] });

const CART = [
  "import { MoreOptions } from '@/components/more-options';",
  '',
  'export default function Cart() {',
  '  return (',
  '    <>',
  '      <h1>Carrito</h1>',
  '      <MoreOptions label="Otras opciones" />',
  '      <a href="/checkout">Ir a pagar</a>',
  '    </>',
  '  );',
  '}',
  '',
].join('\n');

const SHOP = {
  'package.json': '{ "name": "shop" }\n',
  'src/app/cart/page.tsx': CART,
  'src/app/api/cart/route.ts': 'export function GET() {}\n',
  'src/components/more-options.tsx':
    'export function MoreOptions({ label }: { label: string }) { return <a href="#">{label}</a>; }\n',
  'src/lib/pricing.ts': 'export const SHIPPING = 499;\n',
  'UX_FLAWS.md': '# Ground truth\n',
};

const ZONE: FrictionZone = {
  rank: 1,
  route: '/cart',
  element: null,
  intensity: 4,
  signals: 2,
  sessions: 2,
  detectors: [{ detector: 'extra-steps', signals: 2 }],
  boxes: [],
  screenshot: null,
  evidenceEventIds: [],
};

async function attempt(replies: ScriptedReply[], extra: { screenshot?: Uint8Array } = {}) {
  const vcs = new InMemoryVcs({ [URL]: { main: SHOP } });
  const workspace = await vcs.clone(URL, {
    runId: RUN_ID,
    ref: 'main',
    excludeFiles: ['UX_FLAWS.md'],
  });
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies);
  const result = await new GenerateVariantPatch({ gateway, vcs, store }).execute({
    runId: RUN_ID,
    zone: ZONE,
    events: [],
    workspace,
    policy: POLICY,
    allowed: ALLOWED,
    budget: new Budget({ maxTokens: 1_000_000, maxEur: 1 }),
    ...extra,
  });
  return { result, vcs, workspace, store, gateway };
}

const read = (path: string): ScriptedReply => ({ tool: 'read_file', input: { path } });
const edit = (path: string, oldText: string, newText: string): ScriptedReply => ({
  tool: 'edit_file',
  input: { path, old_text: oldText, new_text: newText },
});
const done: ScriptedReply = { tool: 'done', input: { summary: 'Coupon field in sight.' } };

describe('GenerateVariantPatch', () => {
  it('turns the edits into a patch on janus/variant-<runId> and records patch.proposed', async () => {
    const { result, vcs, workspace, store, gateway } = await attempt(
      [
        read('src/app/cart/page.tsx'),
        edit('src/app/cart/page.tsx', 'label="Otras opciones"', 'label="¿Tienes un cupón?"'),
        done,
      ],
      { screenshot: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    );

    expect(result).toMatchObject({
      status: 'proposed',
      stats: { filesChanged: 1, added: 1, removed: 1 },
      summary: 'Coupon field in sight.',
    });
    expect(await vcs.readFile(workspace, 'src/app/cart/page.tsx')).toContain('¿Tienes un cupón?');
    expect((await vcs.head(workspace)).branch).toBe(`janus/variant-${RUN_ID}`);
    const proposed = (await store.readRun(RUN_ID))
      .filter(isKnownEvent)
      .find((event) => event.type === 'patch.proposed');
    expect(proposed).toMatchObject({
      actor: { agentId: 'ui-engineer-z1', role: 'ui-engineer' },
      payload: { author: 'ui-engineer', branch: `janus/variant-${RUN_ID}` },
    });
    expect(
      result.status === 'proposed' && proposed?.type === 'patch.proposed' && proposed.payload.diff,
    ).toBe(result.status === 'proposed' ? result.diff : false);

    // The rules, the measured friction and the code context are the stable, cached prefix.
    const first = gateway.requests[0];
    expect(first?.role).toBe('ui-engineer');
    expect(first?.system.stable).toContain('Page: /cart');
    expect(first?.system.stable).toContain('src/app/cart/page.tsx');
    expect(first?.tools?.map((tool) => tool.name)).toEqual(['read_file', 'edit_file', 'done']);
    expect(first?.messages[0]?.content).toEqual(
      expect.arrayContaining([{ type: 'image', mediaType: 'image/png', data: 'iVBORw==' }]),
    );
    expect(
      gateway.requests.every((request) => request.system.stable === first?.system.stable),
    ).toBe(true);
  });

  it('refuses edits to manifests, business code and the API, and reads no ground truth', async () => {
    const { result, gateway, vcs, workspace } = await attempt([
      edit('package.json', '"shop"', '"pwned"'),
      edit('src/lib/pricing.ts', '499', '0'),
      edit('src/app/api/cart/route.ts', 'GET', 'POST'),
      read('UX_FLAWS.md'),
      done,
    ]);

    expect(result).toMatchObject({ status: 'no-change' });
    // The conversation grows in place: the last request holds every tool result.
    const toolResults = (gateway.requests.at(-1)?.messages ?? [])
      .flatMap((message) => (typeof message.content === 'string' ? [] : message.content))
      .flatMap((block) => (block.type === 'tool_result' ? [block] : []));
    expect(toolResults.filter((block) => block.isError === true)).toHaveLength(4);
    expect(JSON.stringify(gateway.requests)).not.toContain('Ground truth');
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
  });

  it('asks again when old_text is not exactly once in the file', async () => {
    const { result, gateway } = await attempt([
      edit('src/app/cart/page.tsx', '</', '</x'),
      edit('src/app/cart/page.tsx', 'Ir a pagar', 'Pagar'),
      done,
    ]);

    expect(result).toMatchObject({ status: 'proposed', stats: { filesChanged: 1 } });
    expect(JSON.stringify(gateway.requests.at(-1)?.messages)).toContain('it appears 3 times');
  });

  it('rejects and undoes a change beyond 5 files', async () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      edit(
        `src/components/extra-${String(index)}.tsx`,
        '',
        `export const X${String(index)} = 1;\n`,
      ),
    );
    const { result, vcs, workspace } = await attempt([...files, done]);

    expect(result).toEqual({
      status: 'rejected',
      reason: '6 files changed, the limit is 5',
      summary: 'Coupon field in sight.',
    });
    expect(await vcs.listFiles(workspace)).not.toContain('src/components/extra-0.tsx');
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
  });

  it('stops after the turn limit', async () => {
    const { result, gateway } = await attempt([read('src/app/cart/page.tsx')]);

    expect(result).toMatchObject({ status: 'no-change', reason: 'no edits (turn_limit)' });
    expect(gateway.requests).toHaveLength(MAX_TURNS);
  });
});
