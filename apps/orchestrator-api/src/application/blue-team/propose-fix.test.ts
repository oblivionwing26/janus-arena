// F3.5 part A: a fix counts only once its patched variant builds (the type check) and starts.
// Scripted model, in-memory VCS and a scripted sandbox; no API calls, no Docker.

import { isKnownEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import { SandboxStartError } from '../../domain/sandbox/sandbox-errors.js';
import type { RunningVariant, SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import type { VariantSpec } from '../../domain/sandbox/variant-spec.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { ProposeFix } from './propose-fix.js';

const RUN_ID = '01JC0F26B7E0000000000000AA';
const FINDING_ID = '01JC0F26B7E0000000000000FF';
const URL = 'file:///fixtures/juice-shop';
const ALLOWED = ['routes/**/*.ts'];
const TYPE_ERROR = "routes/basket.ts(6,18): error TS2304: Cannot find name 'security'.";

const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};

/** Fails the first `failures` builds as the real sandbox does when tsc fails. */
class ScriptedSandbox implements SandboxPort {
  readonly started: VariantSpec[] = [];
  readonly stopped: string[] = [];
  constructor(private failures: number) {}

  up(variant: VariantSpec): Promise<RunningVariant> {
    this.started.push(variant);
    if (this.failures-- > 0) {
      return Promise.reject(
        new SandboxStartError(variant.id, `docker build failed: ${TYPE_ERROR}`),
      );
    }
    return Promise.resolve({ baseUrl: `http://janus-${variant.id}-app:3000` });
  }
  down(variantId: string): Promise<void> {
    this.stopped.push(variantId);
    return Promise.resolve();
  }
  logs(): Promise<string> {
    return Promise.resolve('');
  }
}

const edit = (oldText: string, newText: string): ScriptedReply => ({
  tool: 'edit_file',
  input: { path: 'routes/basket.ts', old_text: oldText, new_text: newText },
});
const done: ScriptedReply = { tool: 'done', input: { summary: 'Owner check.' } };

async function propose(replies: ScriptedReply[], failures: number) {
  const vcs = new InMemoryVcs({
    [URL]: { main: { 'routes/basket.ts': 'const id = req.params.id\nreturn find(id)\n' } },
  });
  const workspace = await vcs.clone(URL, { runId: RUN_ID, ref: 'main' });
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies);
  const sandbox = new ScriptedSandbox(failures);
  const result = await new ProposeFix({ gateway, vcs, store, sandbox }).execute({
    runId: RUN_ID,
    findingId: FINDING_ID,
    target: 'juice-shop',
    poc: POC,
    endpoint: null,
    workspace,
    policy: new EditPolicy({ allow: ALLOWED }),
    allowed: ALLOWED,
    budget: new Budget({ maxTokens: 1_000_000, maxEur: 1 }),
  });
  const verifications = (await store.readRun(RUN_ID))
    .filter(isKnownEvent)
    .flatMap((event) => (event.type === 'verification.result' ? [event.payload] : []));
  return { result, vcs, workspace, gateway, sandbox, verifications };
}

describe('ProposeFix (F3.5 part A)', () => {
  it('commits the fix and starts its patched variant, left up for the caller', async () => {
    const { result, vcs, workspace, sandbox, verifications } = await propose(
      [edit('return find(id)', 'return find(id, user)'), done],
      0,
    );

    expect(result).toMatchObject({
      status: 'built',
      attempts: 1,
      baseUrl: expect.stringMatching(/^http:\/\/janus-fix-/) as string,
    });
    expect(sandbox.started).toEqual([
      {
        id: expect.stringMatching(/^fix-[a-z0-9]+$/) as string,
        target: 'juice-shop',
        ref: `janus/fix-${FINDING_ID}`,
        repo: workspace.url,
        base: workspace.baseSha,
      },
    ]);
    expect(sandbox.stopped).toEqual([]);
    expect(result.status === 'built' && result.sha).toBe((await vcs.head(workspace)).sha);
    expect(verifications).toMatchObject([{ verifier: 'build-checks', passed: true }]);
  });

  it('undoes a fix that does not build and retries once with the type errors', async () => {
    const { result, vcs, workspace, gateway, verifications } = await propose(
      [
        edit('return find(id)', 'return find(id, security.user)'),
        done,
        edit('return find(id)', 'return find(id, user)'),
        done,
      ],
      1,
    );

    expect(result).toMatchObject({ status: 'built', attempts: 2 });
    expect(verifications).toMatchObject([
      {
        verifier: 'build-checks',
        passed: false,
        details: expect.stringContaining('TS2304') as string,
      },
      { verifier: 'build-checks', passed: true },
    ]);
    const retryBrief = JSON.stringify(gateway.requests[2]?.messages ?? []);
    expect(retryBrief).toContain('TS2304');
    // Only the second fix remains against the base.
    expect(await vcs.readFile(workspace, 'routes/basket.ts')).toContain('find(id, user)');
    expect((await vcs.diffStats(workspace)).files).toEqual([
      { path: 'routes/basket.ts', added: 1, removed: 1 },
    ]);
  });

  it('gives up after two fixes that do not build, with nothing left changed', async () => {
    const { result, vcs, workspace } = await propose(
      [edit('return find(id)', 'return find(id, security.user)'), done],
      2,
    );

    expect(result).toMatchObject({ status: 'failed', attempts: 2 });
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
  });
});
