// F2.3-B: a patch reaches the variant branch only after the target's checks pass; a failure is
// undone and retried once with the checks' output. Scripted model and checks, no API, no Docker.

import { isKnownEvent, type FrictionZone } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { ScriptedBuildChecks } from '../../infrastructure/checks/scripted-build-checks.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { ProposeVariant } from './propose-variant.js';

const RUN_ID = '01JC0F23VRF0000000000000AA';
const URL = 'file:///fixtures/shop';
const ALLOWED = ['src/app/**/page.tsx', 'src/components/**'];
const SHOP = {
  'src/app/cart/page.tsx':
    'export default function Cart() {\n  return <a href="#">Otras opciones</a>;\n}\n',
};
const ZONE: FrictionZone = {
  rank: 2,
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

const edit = (newText: string): ScriptedReply => ({
  tool: 'edit_file',
  input: { path: 'src/app/cart/page.tsx', old_text: 'Otras opciones', new_text: newText },
});
const done: ScriptedReply = { tool: 'done', input: { summary: 'Name the coupon link.' } };

async function propose(replies: ScriptedReply[]) {
  const vcs = new InMemoryVcs({ [URL]: { main: SHOP } });
  const workspace = await vcs.clone(URL, { runId: RUN_ID, ref: 'main' });
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies);
  const checks = new ScriptedBuildChecks(vcs);
  const result = await new ProposeVariant({ gateway, vcs, store, checks }).execute({
    runId: RUN_ID,
    zone: ZONE,
    events: [],
    workspace,
    policy: new EditPolicy({ allow: ALLOWED }),
    allowed: ALLOWED,
    budget: new Budget({ maxTokens: 1_000_000, maxEur: 1 }),
  });
  const verifications = (await store.readRun(RUN_ID))
    .filter(isKnownEvent)
    .flatMap((event) => (event.type === 'verification.result' ? [event.payload] : []));
  return { result, vcs, workspace, gateway, checks, verifications };
}

describe('ProposeVariant', () => {
  it('commits a patch that passes the checks on the variant branch', async () => {
    const { result, vcs, workspace, verifications } = await propose([
      edit('Añadir un cupón'),
      done,
    ]);

    expect(result).toMatchObject({
      status: 'verified',
      attempts: 1,
      summary: 'Name the coupon link.',
    });
    const head = await vcs.head(workspace);
    expect(head).toEqual({
      branch: `janus/variant-${RUN_ID}`,
      sha: result.status === 'verified' ? result.sha : '',
    });
    expect(verifications).toEqual([
      expect.objectContaining({ verifier: 'build-checks', passed: true }),
    ]);
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(1);
  });

  it('undoes a failing patch and retries once with the checks output', async () => {
    const { result, gateway, verifications, vcs, workspace } = await propose([
      edit('BROKEN'),
      done,
      edit('Añadir un cupón'),
      done,
    ]);

    expect(result).toMatchObject({ status: 'verified', attempts: 2 });
    expect(verifications.map((verification) => verification.passed)).toEqual([false, true]);
    const retryBrief = JSON.stringify(gateway.requests.at(-1)?.messages[0]);
    expect(retryBrief).toContain("Cannot find name 'BROKEN'");
    expect(retryBrief).toContain('-  return <a href=\\"#\\">Otras opciones</a>;');
    expect(await vcs.readFile(workspace, 'src/app/cart/page.tsx')).not.toContain('BROKEN');
  });

  it('discards the patch after a second failure and commits nothing', async () => {
    const { result, verifications, vcs, workspace } = await propose([
      edit('BROKEN'),
      done,
      edit('BROKEN'),
      done,
    ]);

    expect(result).toEqual({ status: 'failed', reason: 'the checks failed', attempts: 2 });
    expect(verifications.map((verification) => verification.passed)).toEqual([false, false]);
    expect(verifications[1]?.details).toContain('BROKEN');
    expect((await vcs.head(workspace)).sha).toBe(workspace.baseSha);
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
  });

  it('stops without checks when the agent changes nothing', async () => {
    const { result, checks } = await propose([done]);

    expect(result).toEqual({ status: 'failed', reason: 'no-change: no edits (done)', attempts: 1 });
    expect(checks.runs).toEqual([]);
  });
});
