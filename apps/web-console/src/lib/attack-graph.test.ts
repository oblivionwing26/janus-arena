import { newUlid, parseEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { buildAttackGraph, type NodeState } from './attack-graph';
import type { ConsoleEvent } from './console-event';

const RED_RUN = '01JC0F310RED0000000000000A';
const BLUE_RUN = '01JC0F310B1E0000000000000A';
const BASKET = 'GET /rest/basket/:id';
const LOGIN = 'POST /rest/user/login';
const SEARCH = 'GET /rest/products/search';
let seq = 0;

const event = (runId: string, type: string, payload: unknown): ConsoleEvent =>
  parseEvent({
    id: newUlid(),
    runId,
    seq: seq++,
    ts: new Date(Date.UTC(2026, 10, 13, 10, 0, seq)).toISOString(),
    schemaVersion: 1,
    actor: { agentId: 'orchestrator', role: 'orchestrator' },
    type,
    payload,
  });

const endpoint = (method: string, route: string) => ({
  method,
  route,
  auth: true,
  ownerCheck: 'unknown',
  params: [],
  file: 'routes/x.ts',
  line: 1,
});

const surface = (...routes: [string, string][]) =>
  event(RED_RUN, 'surface.mapped', {
    side: 'variant',
    ref: 'main',
    sha: 'a'.repeat(40),
    endpoints: routes.map(([method, route]) => endpoint(method, route)),
  });

const attempt = (
  at: string,
  as: string,
  testType: string,
  options: { exploitable?: boolean; path?: string; runId?: string } = {},
) => {
  const attemptId = newUlid();
  const [method = '', route = ''] = at.split(' ');
  const runId = options.runId ?? RED_RUN;
  return {
    attemptId,
    events: [
      event(runId, 'attack.attempt', {
        attemptId,
        number: 1,
        testType,
        as,
        method,
        path: options.path ?? route,
        endpoint: at,
        status: 200,
        bytes: 10,
      }),
      ...(options.exploitable === undefined
        ? []
        : [
            event(runId, 'attack.verdict', {
              attemptId,
              testType,
              oracle: 'canary-leak',
              exploitable: options.exploitable,
              evidence: options.exploitable ? 'a canary leaked' : 'nothing leaked',
            }),
          ]),
    ],
  };
};

const finding = (attemptId: string, at: string, severity = 'high') => {
  const findingId = newUlid();
  return {
    findingId,
    events: [
      event(RED_RUN, 'finding.created', {
        findingId,
        kind: 'dynamic',
        severity,
        title: `A finding: ${at} (a canary leaked)`,
        status: 'suspected',
        tool: 'red-team',
        rule: 'idor',
        endpoint: at,
        attemptId,
      }),
      event(RED_RUN, 'finding.confirmed', {
        findingId,
        pocRef: `poc/${findingId.toLowerCase()}.json`,
        evidence: 'replayed',
      }),
    ],
  };
};

const patch = (findingId: string) => {
  const patchId = newUlid();
  return {
    patchId,
    events: [
      event(BLUE_RUN, 'patch.proposed', {
        patchId,
        author: 'blue-team',
        findingId,
        branch: `janus/fix-${findingId}`,
        diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n',
        summary: 'Filter the basket by its owner',
      }),
    ],
  };
};

const verify = (patchId: string, verifier: string, passed: boolean) =>
  event(BLUE_RUN, 'verification.result', { patchId, verifier, passed, details: 'checked' });

const remediated = (findingId: string, status: 'fixed' | 'open') =>
  event(BLUE_RUN, 'finding.remediated', {
    findingId,
    status,
    iterations: 1,
    ...(status === 'fixed' ? { patchId: newUlid(), branch: `janus/fix-${findingId}` } : {}),
    ...(status === 'open' ? { reason: 'regression-tests: failed' } : {}),
  });

const stateOf = (events: ConsoleEvent[], id: string): NodeState | undefined =>
  buildAttackGraph(events).nodes.find((node) => node.id === id)?.state;

describe('buildAttackGraph (F3.10)', () => {
  it('draws every endpoint of the surface map, untested until an attempt reaches it', () => {
    const graph = buildAttackGraph([surface(['GET', '/a'], ['POST', '/b'])]);

    expect(graph.nodes.map((node) => [node.id, node.state])).toEqual([
      ['GET /a', 'untested'],
      ['POST /b', 'untested'],
    ]);
    expect(graph.edges).toEqual([]);
    expect(graph.attackers).toEqual([]);
  });

  it('moves an endpoint from untested to probed to exploited as the events come in', () => {
    const harmless = attempt(SEARCH, 'anonymous', 'xss', { exploitable: false });
    const leak = attempt(BASKET, 'b', 'idor', { exploitable: true });
    const found = finding(leak.attemptId, BASKET);
    const base = [surface(['GET', '/rest/basket/:id'], ['GET', '/rest/products/search'])];

    expect(stateOf(base, BASKET)).toBe('untested');
    expect(stateOf([...base, ...harmless.events], SEARCH)).toBe('probed');
    expect(stateOf([...base, ...harmless.events, ...leak.events], BASKET)).toBe('exploited');
    expect(stateOf([...base, ...harmless.events, ...leak.events, ...found.events], BASKET)).toBe(
      'exploited',
    );
  });

  it('is patched once the Blue Team proposes a fix, and verified once it is fixed', () => {
    const leak = attempt(BASKET, 'b', 'idor', { exploitable: true });
    const found = finding(leak.attemptId, BASKET);
    const fix = patch(found.findingId);
    const history = [surface(['GET', '/rest/basket/:id']), ...leak.events, ...found.events];

    const proposed = [...history, ...fix.events];
    const checked = [...proposed, verify(fix.patchId, 'poc-replay', true)];
    const fixed = [...checked, remediated(found.findingId, 'fixed')];

    expect(stateOf(proposed, BASKET)).toBe('patched');
    expect(stateOf(checked, BASKET)).toBe('patched');
    expect(stateOf(fixed, BASKET)).toBe('verified');
    const node = buildAttackGraph(fixed).nodes[0];
    expect(node?.patches[0]).toMatchObject({
      branch: `janus/fix-${found.findingId}`,
      summary: 'Filter the basket by its owner',
      verifiers: [{ verifier: 'poc-replay', passed: true, details: 'checked' }],
    });
    expect(node?.remediations[0]).toMatchObject({ status: 'fixed' });
  });

  it('keeps an endpoint exploited when the Blue Team gave up on it', () => {
    const leak = attempt(LOGIN, 'anonymous', 'auth-bypass', { exploitable: true });
    const found = finding(leak.attemptId, LOGIN, 'critical');
    const fix = patch(found.findingId);

    const events = [
      surface(['POST', '/rest/user/login']),
      ...leak.events,
      ...found.events,
      ...fix.events,
      verify(fix.patchId, 'regression-tests', false),
      remediated(found.findingId, 'open'),
    ];

    const node = buildAttackGraph(events).nodes[0];
    expect(node?.state).toBe('exploited');
    expect(node?.severity).toBe('critical');
    expect(node?.remediations[0]).toMatchObject({
      status: 'open',
      reason: 'regression-tests: failed',
    });
  });

  it('draws one edge per attacker, endpoint and class, counting the attempts', () => {
    const first = attempt(BASKET, 'b', 'idor', { exploitable: false });
    const second = attempt(BASKET, 'b', 'idor', { exploitable: true });
    const other = attempt(BASKET, 'anonymous', 'auth-bypass', { exploitable: false });

    const graph = buildAttackGraph([...first.events, ...second.events, ...other.events]);

    expect(
      graph.edges.map(({ source, testType, count, exploitable }) => [
        source,
        testType,
        count,
        exploitable,
      ]),
    ).toEqual([
      ['anonymous', 'auth-bypass', 1, false],
      ['b', 'idor', 2, true],
    ]);
    expect(graph.attackers.map((attacker) => attacker.id)).toEqual(['anonymous', 'b']);
  });

  it('does not draw the PoC replays of a Blue Team run as attacks', () => {
    const leak = attempt(BASKET, 'b', 'idor', { exploitable: true });
    const found = finding(leak.attemptId, BASKET);
    const fix = patch(found.findingId);
    const replay = attempt(BASKET, 'b', 'idor', { exploitable: false, runId: BLUE_RUN });

    const graph = buildAttackGraph([
      ...leak.events,
      ...found.events,
      ...fix.events,
      ...replay.events,
    ]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[0]?.attempts).toHaveLength(1);
  });

  it('places the endpoints an attempt touched before the untested ones, deterministically', () => {
    const probe = attempt('GET /z/last', 'anonymous', 'idor', { exploitable: false });
    const events = [
      surface(['GET', '/a/first'], ['GET', '/z/last'], ['GET', '/m/mid']),
      ...probe.events,
    ];

    const graph = buildAttackGraph(events);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'GET /z/last',
      'GET /a/first',
      'GET /m/mid',
    ]);
    expect(graph.nodes[0]?.position).toEqual({ x: 420, y: 0 });
    expect(buildAttackGraph(events)).toEqual(graph);
  });

  it('reads runs recorded before the endpoint fields existed, from the surface and the title', () => {
    const attemptId = newUlid();
    const findingId = newUlid();
    const events = [
      surface(['GET', '/rest/basket/:id']),
      event(RED_RUN, 'attack.attempt', {
        attemptId,
        number: 1,
        testType: 'idor',
        as: 'b',
        method: 'GET',
        path: '/rest/basket/6',
        status: 200,
        bytes: 3,
      }),
      event(RED_RUN, 'attack.verdict', {
        attemptId,
        testType: 'idor',
        oracle: 'canary-leak',
        exploitable: true,
        evidence: 'leak',
      }),
      event(RED_RUN, 'finding.created', {
        findingId,
        kind: 'dynamic',
        severity: 'high',
        title: 'Another user’s data is reachable (IDOR): GET /rest/basket/:id (user 26 received…)',
        status: 'suspected',
      }),
    ];

    const graph = buildAttackGraph(events);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: BASKET, state: 'exploited' });
    expect(graph.nodes[0]?.findings[0]?.findingId).toBe(findingId);
  });

  it('names the run that saved a confirmed finding’s PoC', () => {
    const leak = attempt(BASKET, 'b', 'idor', { exploitable: true });
    const found = finding(leak.attemptId, BASKET);

    const node = buildAttackGraph([...leak.events, ...found.events]).nodes[0];

    expect(node?.findings[0]).toMatchObject({ confirmed: true, pocRunId: RED_RUN });
  });

  it('ignores unknown events and static findings', () => {
    const unknown = {
      ...event(RED_RUN, 'run.started', { budget: { maxTokens: 1, maxEur: 1 } }),
      type: 'replay.bookmarked',
    } as ConsoleEvent;
    const staticFinding = event(RED_RUN, 'finding.created', {
      findingId: newUlid(),
      kind: 'static',
      severity: 'low',
      title: 'a static lead',
      status: 'suspected',
      file: 'a.ts',
    });

    expect(buildAttackGraph([unknown, staticFinding]).nodes).toEqual([]);
  });
});
