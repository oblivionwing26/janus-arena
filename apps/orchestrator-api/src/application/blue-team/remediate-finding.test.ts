// F3.5: the Blue Team loop. A fix counts only when every verifier passes; at most 3 iterations,
// then the finding stays open. Scripted model, in-memory VCS, scripted sandbox, fake verifiers.

import { isKnownEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { FixUnderTest, FixVerification, FixVerifier } from '../../domain/fix/fix-verifier.js';
import { Budget } from '../../domain/llm/budget.js';
import type { RunningVariant, SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import type { VariantSpec } from '../../domain/sandbox/variant-spec.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { RemediateFinding } from './remediate-finding.js';

const RUN_ID = '01JC0F2AB7E0000000000000AA';
const FINDING_ID = '01JC0F2AB7E0000000000000FF';
const URL = 'file:///fixtures/juice-shop';
const ALLOWED = ['routes/**/*.ts'];
const REGRESSION = {
  path: 'test/api/janus-regression.test.ts',
  name: 'test/api/janus-regression.test.ts > janus > leaks',
  source: '// regression\n',
};
const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};

class Sandbox implements SandboxPort {
  readonly stopped: string[] = [];
  up(variant: VariantSpec): Promise<RunningVariant> {
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

/** Answers each fix in turn; records what it was shown. */
class Verifier implements FixVerifier {
  readonly seen: FixUnderTest[] = [];
  constructor(
    readonly name: FixVerifier['name'],
    private readonly answers: FixVerification[],
  ) {}
  verify(fix: FixUnderTest): Promise<FixVerification> {
    this.seen.push(fix);
    return Promise.resolve(
      this.answers[this.seen.length - 1] ?? this.answers.at(-1) ?? { passed: true, details: '' },
    );
  }
}

const pass = (details = 'ok'): FixVerification => ({ passed: true, details });
const fail = (details: string): FixVerification => ({ passed: false, details });
const edit = (newText: string): ScriptedReply => ({
  tool: 'edit_file',
  input: { path: 'routes/basket.ts', old_text: 'return find(id)', new_text: newText },
});
const done: ScriptedReply = { tool: 'done', input: { summary: 'Owner check.' } };

async function remediate(replies: ScriptedReply[], v1: Verifier, v2: Verifier) {
  const vcs = new InMemoryVcs({
    [URL]: { main: { 'routes/basket.ts': 'const id = req.params.id\nreturn find(id)\n' } },
  });
  const workspace = await vcs.clone(URL, { runId: RUN_ID, ref: 'main' });
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies);
  const sandbox = new Sandbox();
  const result = await new RemediateFinding({
    gateway,
    vcs,
    store,
    sandbox,
    verifiers: [v1, v2],
    regressionTest: () => REGRESSION,
  }).execute({
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
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  const verifications = events.flatMap((event) =>
    event.type === 'verification.result' ? [event.payload] : [],
  );
  const remediated = events.flatMap((event) =>
    event.type === 'finding.remediated' ? [event.payload] : [],
  );
  return { result, vcs, workspace, gateway, sandbox, verifications, remediated };
}

describe('RemediateFinding (F3.5)', () => {
  it('fixes the finding when every verifier passes, and keeps the regression test', async () => {
    const v1 = new Verifier('poc-replay', [pass('the PoC no longer works')]);
    const v2 = new Verifier('regression-tests', [pass()]);
    const { result, vcs, workspace, sandbox, verifications, remediated } = await remediate(
      [edit('return find(id, user)'), done],
      v1,
      v2,
    );

    expect(result).toMatchObject({ status: 'fixed', iterations: 1 });
    expect(v1.seen[0]).toMatchObject({
      runId: RUN_ID,
      findingId: FINDING_ID,
      base: workspace.baseSha,
      repo: workspace.url,
      variantId: expect.stringMatching(/^fix-/) as string,
    });
    expect(verifications.map((each) => [each.verifier, each.passed])).toEqual([
      ['build-checks', true],
      ['poc-replay', true],
      ['regression-tests', true],
    ]);
    expect(remediated).toMatchObject([
      { findingId: FINDING_ID, status: 'fixed', iterations: 1, branch: `janus/fix-${FINDING_ID}` },
    ]);
    // The regression test is part of the fix; the variant is taken down.
    expect(await vcs.readFile(workspace, REGRESSION.path)).toBe(REGRESSION.source);
    expect((await vcs.diffStats(workspace)).files.map((file) => file.path)).toEqual([
      'routes/basket.ts',
      REGRESSION.path,
    ]);
    expect(sandbox.stopped).toHaveLength(1);
  });

  it('undoes a fix a verifier rejects and tries again with why, stopping at that verifier', async () => {
    const v1 = new Verifier('poc-replay', [fail('the PoC still works: canary leaked'), pass()]);
    const v2 = new Verifier('regression-tests', [pass()]);
    const { result, vcs, workspace, gateway } = await remediate(
      [edit('return find(id, maybe)'), done, edit('return find(id, user)'), done],
      v1,
      v2,
    );

    expect(result).toMatchObject({ status: 'fixed', iterations: 2 });
    expect(v2.seen).toHaveLength(1);
    expect(JSON.stringify(gateway.requests[2]?.messages ?? [])).toContain('canary leaked');
    expect(await vcs.readFile(workspace, 'routes/basket.ts')).toContain('find(id, user)');
    expect((await vcs.diffStats(workspace)).files).toContainEqual({
      path: 'routes/basket.ts',
      added: 1,
      removed: 1,
    });
  });

  it('leaves the finding open after 3 iterations, with nothing changed', async () => {
    const v1 = new Verifier('poc-replay', [fail('the PoC still works')]);
    const v2 = new Verifier('regression-tests', [pass()]);
    const attempt = [edit('return find(id, maybe)'), done];
    const { result, vcs, workspace, sandbox, remediated } = await remediate(
      [...attempt, ...attempt, ...attempt],
      v1,
      v2,
    );

    expect(result).toMatchObject({ status: 'open', iterations: 3 });
    expect(remediated).toMatchObject([
      { status: 'open', iterations: 3, reason: 'poc-replay: the PoC still works' },
    ]);
    expect((await vcs.diffStats(workspace)).filesChanged).toBe(0);
    expect(sandbox.stopped).toHaveLength(3);
  });
});
