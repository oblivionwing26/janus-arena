// F3.5 part A: the Blue Team's rules are enforced by code, whatever the model asks for. A
// scripted gateway plays the model; the workspace is the in-memory VCS. No API calls.

import { isKnownEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { GenerateFix } from './generate-fix.js';

const RUN_ID = '01JC0F25B7E0000000000000AA';
const FINDING_ID = '01JC0F25B7E0000000000000FF';
const URL = 'file:///fixtures/juice-shop';
const ALLOWED = ['routes/**/*.ts', 'lib/**/*.ts', 'models/**/*.ts'];
const POLICY = new EditPolicy({ allow: ALLOWED, deny: ['lib/startup/**'] });

const BASKET = [
  "import { type Request, type Response } from 'express'",
  "import { BasketModel } from '../models/basket'",
  '',
  'export function retrieveBasket () {',
  '  return async (req: Request, res: Response) => {',
  '    const id = req.params.id',
  '    const basket = await BasketModel.findOne({ where: { id } }) // vuln-code-snippet vuln-line basketAccessChallenge',
  '    res.json({ data: basket })',
  '  }',
  '}',
  '',
].join('\n');

const SHOP = {
  'package.json': '{ "name": "juice-shop" }\n',
  'routes/basket.ts': BASKET,
  'models/basket.ts': 'export const BasketModel = { findOne: async (_: unknown) => null }\n',
  'lib/insecurity.ts': 'export const authenticatedUsers = { from: (_: unknown) => null }\n',
  'lib/startup/validateConfig.ts': 'export default () => true\n',
  'frontend/src/main.ts': 'bootstrap()\n',
  'test/server/basket.unit.test.ts': "it('works', () => {})\n",
  'data/static/codefixes/basketAccessChallenge_1_correct.ts': 'export const fixed = true\n',
};

const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};

const ENDPOINT: Endpoint = {
  route: '/rest/basket/:id',
  method: 'GET',
  declaredAt: { file: 'server.ts', line: 40 },
  handler: { file: 'routes/basket.ts', line: 4, name: 'retrieveBasket' },
  params: ['id'],
  auth: true,
  ownerCheck: false,
};

async function attempt(replies: ScriptedReply[], extra: { retry?: string } = {}) {
  const vcs = new InMemoryVcs({ [URL]: { main: SHOP } });
  const workspace = await vcs.clone(URL, {
    runId: RUN_ID,
    ref: 'main',
    excludeFiles: ['data/static/codefixes'],
    stripComments: ['vuln-code-snippet'],
  });
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies);
  const result = await new GenerateFix({ gateway, vcs, store }).execute({
    runId: RUN_ID,
    findingId: FINDING_ID,
    poc: POC,
    endpoint: ENDPOINT,
    workspace,
    policy: POLICY,
    allowed: ALLOWED,
    budget: new Budget({ maxTokens: 1_000_000, maxEur: 1 }),
    ...(extra.retry === undefined ? {} : { retry: { diff: '--- a/x', failure: extra.retry } }),
  });
  return { result, vcs, workspace, store, gateway };
}

const read = (path: string): ScriptedReply => ({ tool: 'read_file', input: { path } });
const edit = (path: string, oldText: string, newText: string): ScriptedReply => ({
  tool: 'edit_file',
  input: { path, old_text: oldText, new_text: newText },
});
const done: ScriptedReply = { tool: 'done', input: { summary: 'Baskets are read by owner.' } };
const OWNER_CHECK = [
  'routes/basket.ts',
  '    const id = req.params.id',
  '    const user = security.authenticatedUsers.from(req)\n    const id = req.params.id',
] as const;

describe('GenerateFix (F3.5 part A)', () => {
  it('turns the edits into a fix on janus/fix-<findingId> and records patch.proposed', async () => {
    const { result, vcs, workspace, store } = await attempt([
      read('routes/basket.ts'),
      edit(...OWNER_CHECK),
      done,
    ]);

    expect(result).toMatchObject({
      status: 'proposed',
      stats: { filesChanged: 1, added: 1, removed: 0 },
      summary: 'Baskets are read by owner.',
    });
    expect((await vcs.head(workspace)).branch).toBe(`janus/fix-${FINDING_ID}`);
    expect(await vcs.readFile(workspace, 'routes/basket.ts')).toContain('authenticatedUsers.from');
    const proposed = (await store.readRun(RUN_ID))
      .filter(isKnownEvent)
      .find((event) => event.type === 'patch.proposed');
    expect(proposed).toMatchObject({
      actor: { role: 'blue-team' },
      payload: {
        author: 'blue-team',
        findingId: FINDING_ID,
        branch: `janus/fix-${FINDING_ID}`,
        summary: 'Baskets are read by owner.',
      },
    });
  });

  it('briefs the agent with the finding and its code, never the target’s ground truth', async () => {
    const { gateway } = await attempt([done]);
    const request = gateway.requests[0];
    const prompt = request?.system.stable ?? '';

    expect(request?.role).toBe('blue-team');
    expect(prompt).toContain('GET /rest/basket/:id');
    expect(prompt).toContain('routes/basket.ts');
    expect(prompt).toContain('another user');
    expect(prompt).toContain('routes/**/*.ts');
    // The handler's code is in the prompt, stripped of the markers that point at the flaw.
    expect(prompt).toContain('BasketModel.findOne');
    expect(prompt).not.toContain('vuln-code-snippet');
    expect(prompt).not.toContain('basketAccessChallenge');
    expect(prompt).not.toContain('codefixes');
  });

  it('refuses edits outside the backend sources, and reads no tests or frontend', async () => {
    const { result, gateway, vcs, workspace } = await attempt([
      read('test/server/basket.unit.test.ts'),
      edit('frontend/src/main.ts', 'bootstrap()', 'bootstrap(1)'),
      edit('lib/startup/validateConfig.ts', 'true', 'false'),
      edit('package.json', 'juice-shop', 'x'),
      done,
    ]);

    expect(result).toMatchObject({ status: 'no-change' });
    expect(await vcs.readFile(workspace, 'frontend/src/main.ts')).toBe('bootstrap()\n');
    const results = JSON.stringify(gateway.requests.at(-1)?.messages ?? []);
    expect(results).toContain('No readable file test/server/basket.unit.test.ts');
    expect(results).toContain('You may not edit frontend/src/main.ts');
  });

  it('rejects and undoes a fix over the limits (5 files, 200 lines)', async () => {
    const big = Array.from({ length: 210 }, (_, i) => `// line ${String(i)}`).join('\n');
    const { result, vcs, workspace } = await attempt([edit('lib/owner.ts', '', `${big}\n`), done]);

    expect(result).toMatchObject({ status: 'rejected' });
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
  });

  it('on a retry, tells the agent why its previous fix failed', async () => {
    const { gateway } = await attempt([done], { retry: 'routes/basket.ts(6,18): error TS2304' });
    const brief = JSON.stringify(gateway.requests[0]?.messages ?? []);

    expect(brief).toContain('error TS2304');
  });
});
