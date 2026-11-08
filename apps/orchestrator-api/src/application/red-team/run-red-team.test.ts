import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { AttackTarget } from '../../domain/attack/attack-target.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import { Budget } from '../../domain/llm/budget.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedReply, ScopedRequest } from '../../domain/scope/scoped-http-port.js';
import { VerifiedScope } from '../../domain/scope/verified-scope.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { InMemoryTestUsers } from '../../infrastructure/attack/in-memory-test-users.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryScopedHttp } from '../../infrastructure/scope/in-memory-scoped-http.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { RunRedTeam, type RedTeamEngine } from './run-red-team.js';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const ORIGIN = 'http://janus-red-app:3000';
const TOKEN = 'janus-verify-01JC0F28CNS0000000000000AA';
const STOLEN_JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdGF0dXMiOiJhZG1pbiJ9.c2ln';
const CANARY = 'Apple Juice (1000ml)';
const policy: ScopePolicy = {
  target: 'juice-shop',
  origins: [ORIGIN],
  excludedPaths: ['/api/Challenges/**'],
  allowedTests: ['http-probe', 'idor', 'auth-bypass'],
  maxRequestsPerSecond: 100,
};
const scope = VerifiedScope.verify(policy, TOKEN, new Map([[ORIGIN, TOKEN]]), 'now');

const endpoint = (over: Partial<Endpoint> & Pick<Endpoint, 'method' | 'route'>): Endpoint => ({
  declaredAt: { file: 'server.ts', line: 1 },
  handler: null,
  params: [],
  auth: true,
  ownerCheck: false,
  ...over,
});
const endpoints: Endpoint[] = [
  endpoint({ method: 'GET', route: '/rest/basket/:id', ownerCheck: false }),
  endpoint({ method: 'POST', route: '/rest/user/login', params: ['email', 'password'] }),
];
const leads: StaticFinding[] = [
  {
    kind: 'static',
    tool: 'semgrep',
    rule: 'janus.quantity-upper-bound-only',
    severity: 'medium',
    message: 'Quantity checked only against an upper bound',
    file: 'routes/basketItems.ts',
    line: 94,
    snippet: 'if (product.quantity >= quantity) { // vuln-code-snippet vuln-line',
  },
  {
    kind: 'static',
    tool: 'semgrep',
    rule: 'janus.x',
    severity: 'high',
    message: 'The fixed version of a challenge',
    file: 'data/static/codefixes/loginAdminChallenge_4_correct.ts',
    line: 3,
    snippet: 'the answer',
  },
];

const reply = (status: number, body: string): ScopedReply => ({
  status,
  headers: { 'content-type': 'application/json' },
  body,
});

/**
 * A shop with Juice Shop's two flaws, or (secure) without them: baskets reachable by id for
 * anyone with a session, and a login that splices its input into a query.
 */
class FakeShop {
  readonly users = new InMemoryTestUsers();
  readonly baskets = new Map<number, string[]>();
  private readonly byToken = new Map<string, number>();

  constructor(private readonly secure = false) {}

  private basketOf(request: ScopedRequest): number | null {
    const token = request.headers?.authorization?.replace('Bearer ', '');
    return token === undefined ? null : (this.byToken.get(token) ?? null);
  }

  handle(request: ScopedRequest): ScopedReply {
    const { pathname } = new URL(request.url);
    const basket = /^\/rest\/basket\/(\d+)$/.exec(pathname);
    if (basket !== null && request.method === 'GET') {
      const id = Number(basket[1]);
      const caller = this.basketOf(request);
      if (caller === null) return reply(401, '');
      if (this.secure && caller !== id) return reply(403, '{"error":"Forbidden"}');
      return reply(
        200,
        JSON.stringify({
          data: {
            id,
            UserId: id,
            Products: (this.baskets.get(id) ?? []).map((name) => ({ name })),
          },
        }),
      );
    }
    if (pathname === '/rest/user/login' && request.method === 'POST') {
      const injected = (request.body ?? '').includes("'");
      return injected && !this.secure
        ? reply(200, JSON.stringify({ authentication: { token: STOLEN_JWT, bid: 1 } }))
        : reply(401, 'Invalid email or password.');
    }
    return reply(404, 'Not found');
  }

  target(): AttackTarget {
    const { users, baskets, byToken } = this;
    return {
      users: {
        register: (label) => users.register(label),
        login: async (user) => {
          const session = await users.login(user);
          byToken.set(session.token, session.basketId ?? 0);
          return session;
        },
        whoami: async (token) => (token === STOLEN_JWT ? 'admin@juice-sh.op' : users.whoami(token)),
      },
      victim: {
        seed: (victim: TestSession) => {
          baskets.set(victim.basketId ?? 0, [CANARY]);
          return Promise.resolve([CANARY]);
        },
      },
    };
  }
}

interface RunOptions {
  readonly shop?: FakeShop;
  readonly engine?: RedTeamEngine;
  readonly replies?: ScriptedReply[];
  readonly limits?: { perEndpoint: number; total: number };
  readonly surface?: Endpoint[];
}

async function run(options: RunOptions = {}) {
  const shop = options.shop ?? new FakeShop();
  const http = new InMemoryScopedHttp((each) => shop.handle(each));
  const store = new InMemoryEventStore();
  const gateway = new ScriptedGateway(
    options.replies ?? [{ tool: 'done', input: { summary: 'ok' } }],
  );
  const result = await new RunRedTeam({
    gateway,
    store,
    http,
    target: () => shop.target(),
  }).execute({
    runId: RUN_ID,
    scope,
    origin: ORIGIN,
    classes: ['idor', 'auth-bypass'],
    endpoints: options.surface ?? endpoints,
    findings: leads,
    budget: new Budget({ maxTokens: 1_000_000, maxEur: 1 }),
    ...(options.engine === undefined ? {} : { engine: options.engine }),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  return { result, events, gateway, shop, http };
}

describe('RunRedTeam deterministic engine', () => {
  it('finds the IDOR and the login bypass by generating attacks from the surface map', async () => {
    const { result, events } = await run();

    expect(result.engine).toBe('deterministic');
    expect(result.findings.map((f) => f.testType).sort()).toEqual(['auth-bypass', 'idor']);
    const idor = result.findings.find((f) => f.testType === 'idor');
    expect(idor?.endpoint).toBe('GET /rest/basket/:id');
    const findings = events.flatMap((e) => (e.type === 'finding.created' ? [e.payload] : []));
    expect(findings.map((f) => [f.rule, f.severity, f.status, f.kind]).sort()).toEqual([
      ['auth-bypass', 'critical', 'suspected', 'dynamic'],
      ['idor', 'high', 'suspected', 'dynamic'],
    ]);
    // Every sent attempt got an oracle verdict, including the harmless neighbours.
    expect(events.filter((e) => e.type === 'attack.verdict').length).toBe(
      events.filter((e) => e.type === 'attack.attempt').length,
    );
  });

  it('finds nothing against a shop that filters by the owner and rejects the injection', async () => {
    const { result, events } = await run({ shop: new FakeShop(true) });

    expect(result.findings).toEqual([]);
    expect(events.filter((e) => e.type === 'attack.attempt').length).toBeGreaterThan(0);
    expect(
      events.flatMap((e) => (e.type === 'attack.verdict' ? [e.payload.exploitable] : [])),
    ).not.toContain(true);
  });

  it('stops probing an endpoint once its attempt limit is used up', async () => {
    const { events } = await run({
      shop: new FakeShop(true),
      limits: { perEndpoint: 2, total: 20 },
    });

    const basketAttempts = events.filter(
      (e) => e.type === 'attack.attempt' && e.payload.path.startsWith('/rest/basket/'),
    );
    expect(basketAttempts).toHaveLength(2);
  });

  it('keeps every generated attack inside the scope', async () => {
    const { events, http } = await run({
      shop: new FakeShop(true),
      surface: [endpoint({ method: 'GET', route: '/api/Challenges/:id', ownerCheck: false })],
    });

    expect(http.sent.map((each) => new URL(each.url).pathname)).not.toContain('/api/Challenges/1');
    const blocked = events.filter(
      (e) => e.type === 'attack.attempt' && e.payload.blocked === 'excluded-path',
    );
    expect(blocked.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'scope.blocked').length).toBe(blocked.length);
  });

  it('records no password, token, owner id or response body', async () => {
    const { events, shop } = await run();

    const recorded = JSON.stringify(events);
    // No token, no raw response field and no password; the synthetic canary stays, as evidence.
    expect(recorded).not.toContain(STOLEN_JWT);
    expect(recorded).not.toContain('UserId');
    expect(shop.users.accounts.size).toBe(2);
    for (const user of shop.users.accounts.values()) expect(recorded).not.toContain(user.password);
    expect(recorded).not.toMatch(/"password"/);
  });
});

describe('RunRedTeam agent engine (kept but off by default, ADR 0011)', () => {
  const request = (input: Record<string, unknown>): ScriptedReply => ({
    tool: 'http_request',
    input,
  });
  const claim = (cls: string, attempt: number): ScriptedReply => ({
    tool: 'claim',
    input: { class: cls, attempt },
  });

  it('drives the same bench: a finding only when the oracle confirms a claim', async () => {
    const { result, events } = await run({
      engine: 'agent',
      replies: [
        request({ as: 'b', method: 'GET', path: '/rest/basket/2', class: 'idor' }),
        claim('idor', 1),
        request({ as: 'b', method: 'GET', path: '/rest/basket/1', class: 'idor' }),
        claim('idor', 2),
        { tool: 'done', input: { summary: 'done' } },
      ],
    });

    expect(result.engine).toBe('agent');
    expect(result.findings).toMatchObject([{ testType: 'idor', endpoint: 'GET /rest/basket/:id' }]);
    expect(
      events.flatMap((e) => (e.type === 'attack.verdict' ? [e.payload.exploitable] : [])),
    ).toEqual([false, true]);
  });

  it('gives the agent structured leads only, never code or the target’s ground truth', async () => {
    const { gateway } = await run({ engine: 'agent' });
    const system = gateway.requests[0]?.system.stable ?? '';

    expect(system).toContain('GET /rest/basket/:id | session: yes | owner check: false');
    expect(system).toContain('routes/basketItems.ts:94');
    expect(system).not.toContain('vuln-code-snippet');
    expect(system).not.toContain('codefixes');
    expect(gateway.requests[0]?.role).toBe('red-team');
  });

  it('refuses a claim about an attempt that tested another class', async () => {
    const { gateway } = await run({
      engine: 'agent',
      replies: [
        request({ as: 'b', method: 'GET', path: '/rest/basket/1', class: 'idor' }),
        claim('auth-bypass', 1),
        { tool: 'done', input: { summary: 'done' } },
      ],
    });

    const toolResults = gateway.requests.flatMap((r) =>
      r.messages.flatMap((m) =>
        typeof m.content === 'string'
          ? []
          : m.content.flatMap((b) => (b.type === 'tool_result' ? [b.content] : [])),
      ),
    );
    expect(toolResults).toContain('Attempt #1 was sent to test idor, not auth-bypass.');
  });
});
