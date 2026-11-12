// F3.6: when V3 rejects a fix, the Blue Team writes alternatives with other strategies; each is
// measured with V1 and V3 and code recommends one. Scripted model, in-memory VCS, fake verifiers.

import { isKnownEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type {
  FixUnderTest,
  FixVerification,
  FixVerifier,
  UxMeasurement,
} from '../../domain/fix/fix-verifier.js';
import { Budget } from '../../domain/llm/budget.js';
import type { RunningVariant, SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import type { VariantSpec } from '../../domain/sandbox/variant-spec.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { ExploreTradeoffs, STRATEGIES } from './explore-tradeoffs.js';

const RUN_ID = '01JC0F2FB7E0000000000000AA';
const FINDING_ID = '01JC0F2FB7E0000000000000FF';
const URL = 'file:///fixtures/juice-shop';
const ALLOWED = ['routes/**/*.ts'];
const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'brute-force',
  oracle: 'unthrottled-guessing',
  endpoint: 'POST /rest/user/login',
  steps: {
    kind: 'login-guessing',
    method: 'POST',
    path: '/rest/user/login',
    identity: 'email',
    password: 'password',
    guesses: 20,
  },
};

class Sandbox implements SandboxPort {
  up(variant: VariantSpec): Promise<RunningVariant> {
    return Promise.resolve({ baseUrl: `http://janus-${variant.id}-app:3000` });
  }
  down(): Promise<void> {
    return Promise.resolve();
  }
  logs(): Promise<string> {
    return Promise.resolve('');
  }
}

/** Judges each fix by the marker its code carries: `lockout`, `delay` or `limit`. */
class MarkerVerifier implements FixVerifier {
  readonly seen: string[] = [];
  constructor(
    readonly name: FixVerifier['name'],
    private readonly verdicts: Record<string, FixVerification>,
    private readonly read: (fix: FixUnderTest) => Promise<string>,
  ) {}
  async verify(fix: FixUnderTest): Promise<FixVerification> {
    const code = await this.read(fix);
    const marker = Object.keys(this.verdicts).find((key) => code.includes(key)) ?? 'none';
    this.seen.push(marker);
    return this.verdicts[marker] ?? { passed: false, details: 'unknown fix' };
  }
}

const ux = (successes: number, p95: number): UxMeasurement => ({
  runId: '01JC0F2FB7E0000000000000BB',
  a: { successes: 4, n: 6 },
  b: { successes, n: 6 },
  latency: [{ endpoint: 'POST /rest/user/login', a: 60, b: p95 }],
});
const edit = (marker: string): ScriptedReply => ({
  tool: 'edit_file',
  input: {
    path: 'routes/login.ts',
    old_text: 'return login()',
    new_text: `return ${marker}(login())`,
  },
});
const done: ScriptedReply = { tool: 'done', input: { summary: 'Guessing is stopped.' } };

const FREE_FIX_DIFF = [
  'diff --git a/routes/login.ts b/routes/login.ts',
  '--- a/routes/login.ts',
  '+++ b/routes/login.ts',
  '@@ -1 +1 @@',
  '-return login()',
  '+return limit(login())',
  '',
].join('\n');

async function explore(
  replies: ScriptedReply[],
  v3Verdicts: Record<string, FixVerification>,
  extra: Partial<Parameters<ExploreTradeoffs['execute']>[0]> = {},
) {
  const vcs = new InMemoryVcs({ [URL]: { main: { 'routes/login.ts': 'return login()\n' } } });
  const workspace = await vcs.clone(URL, { runId: RUN_ID, ref: 'main' });
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(replies);
  const read = () => vcs.readFile(workspace, 'routes/login.ts');
  const v1 = new MarkerVerifier(
    'poc-replay',
    {
      lockout: { passed: true, details: 'the PoC no longer works: locked' },
      delay: { passed: true, details: 'the PoC no longer works: slowed down' },
      limit: { passed: true, details: 'the PoC no longer works: 429' },
      noop: { passed: false, details: 'the PoC still works' },
    },
    read,
  );
  const v3 = new MarkerVerifier('synthlab-rerun', v3Verdicts, read);
  const result = await new ExploreTradeoffs({
    gateway,
    vcs,
    store,
    sandbox: new Sandbox(),
    v1,
    v3,
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
    ...extra,
  });
  const remediated = (await store.readRun(RUN_ID))
    .filter(isKnownEvent)
    .flatMap((event) => (event.type === 'finding.remediated' ? [event.payload] : []));
  return { result, vcs, workspace, gateway, v3, remediated };
}

const LOCKOUT_LOSES = {
  lockout: { passed: false, details: 'success dropped', measured: ux(2, 70) },
  delay: { passed: false, details: 'over its latency budget', measured: ux(4, 2400) },
  limit: { passed: true, details: 'ok', measured: ux(4, 65) },
};

describe('ExploreTradeoffs (F3.6)', () => {
  it('stops at the free fix when it closes the attack and keeps the UX', async () => {
    const { result, remediated } = await explore([edit('limit'), done], LOCKOUT_LOSES);

    expect(result.rows.map((row) => row.label)).toEqual(['free fix']);
    expect(result.recommendation.row?.label).toBe('free fix');
    expect(remediated).toMatchObject([{ status: 'fixed', iterations: 1 }]);
  });

  it('asks for the other strategies when V3 rejects the fix, and recommends the best', async () => {
    const { result, vcs, workspace, gateway, remediated } = await explore(
      [edit('lockout'), done, edit('lockout'), done, edit('delay'), done, edit('limit'), done],
      LOCKOUT_LOSES,
    );

    expect(result.rows.map((row) => [row.label, row.exploitable, row.uxPassed])).toEqual([
      ['free fix', false, false],
      ['account lockout', false, false],
      ['progressive delay', false, false],
      ['per-account attempt limit', false, true],
    ]);
    expect(result.recommendation.row?.label).toBe('per-account attempt limit');
    // Each alternative's brief names its strategy.
    const briefs = gateway.requests.map((request) => JSON.stringify(request.messages[0]));
    for (const strategy of STRATEGIES) {
      expect(briefs.some((brief) => brief.includes(strategy.direction))).toBe(true);
    }
    // The branch ends holding the recommended alternative, and only it.
    expect(await vcs.readFile(workspace, 'routes/login.ts')).toBe('return limit(login())\n');
    expect(remediated).toMatchObject([{ status: 'fixed', iterations: 4 }]);
  });

  it('measures only the strategies asked for, after rows already measured, and ranks them all', async () => {
    const earlier = {
      label: 'free fix',
      strategy: null,
      patchId: '01JC0F2FB7E00000000000PREV',
      exploitable: false,
      ux: ux(5, 90),
      uxPassed: true,
      note: 'measured before',
    };
    const { result, vcs, workspace, gateway, v3 } = await explore(
      [edit('lockout'), done, edit('delay'), done],
      LOCKOUT_LOSES,
      {
        strategies: ['account-lockout', 'progressive-delay'],
        measured: { rows: [earlier], diffs: { 'free fix': FREE_FIX_DIFF } },
      },
    );

    expect(result.rows.map((row) => row.label)).toEqual([
      'free fix',
      'account lockout',
      'progressive delay',
    ]);
    expect(v3.seen).toEqual(['lockout', 'delay']);
    expect(gateway.requests.some((request) => JSON.stringify(request).includes('free fix'))).toBe(
      false,
    );
    // The earlier free fix still wins, and the branch ends holding it.
    expect(result.recommendation.row?.label).toBe('free fix');
    expect(await vcs.readFile(workspace, 'routes/login.ts')).toBe('return limit(login())\n');
  });

  it('never runs V3 on an alternative that leaves the attack open', async () => {
    const { result, v3 } = await explore(
      [edit('noop'), done, edit('lockout'), done, edit('delay'), done, edit('limit'), done],
      LOCKOUT_LOSES,
    );

    expect(result.rows[0]).toMatchObject({ label: 'free fix', exploitable: true, ux: null });
    expect(v3.seen).toEqual(['lockout', 'delay', 'limit']);
  });
});
