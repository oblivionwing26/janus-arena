import { isKnownEvent, proofOfConceptSchema, type RedTeamClass } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { AttackTarget } from '../../domain/attack/attack-target.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import { Budget } from '../../domain/llm/budget.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedReply, ScopedRequest } from '../../domain/scope/scoped-http-port.js';
import { VerifiedScope } from '../../domain/scope/verified-scope.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { InMemoryBrowserAttack } from '../../infrastructure/attack/in-memory-browser-attack.js';
import { InMemoryTestUsers } from '../../infrastructure/attack/in-memory-test-users.js';
import { InMemoryArtifactStore } from '../../infrastructure/artifacts/in-memory-artifact-store.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryScopedHttp } from '../../infrastructure/scope/in-memory-scoped-http.js';
import { ScriptedGateway, type ScriptedReply } from '../../test-support/scripted-gateway.js';
import { pocKey, RunRedTeam, type RedTeamEngine } from './run-red-team.js';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const ORIGIN = 'http://janus-red-app:3000';
const TOKEN = 'janus-verify-01JC0F28CNS0000000000000AA';
const STOLEN_JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdGF0dXMiOiJhZG1pbiJ9.c2ln';
const CANARY = 'Apple Juice (1000ml)';
const policy: ScopePolicy = {
  target: 'juice-shop',
  origins: [ORIGIN],
  excludedPaths: ['/api/Challenges/**'],
  allowedTests: [
    'http-probe',
    'idor',
    'auth-bypass',
    'xss',
    'business-logic',
    'brute-force',
    'race',
  ],
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
  endpoint({ method: 'PUT', route: '/api/BasketItems/:id', params: ['body.quantity'] }),
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
 * A shop with Juice Shop's flaws, or (secure) without them: baskets reachable by id for anyone
 * with a session, a login that splices its input into a query, a search that renders its query
 * as HTML, orders that take a negative quantity, and likes that can be raced.
 */
class FakeShop {
  readonly users = new InMemoryTestUsers();
  readonly baskets = new Map<number, string[]>();
  readonly likedBy: string[] = [];
  /** Wrong passwords per account, for the secure shop's throttling (F3.6). */
  private readonly failures = new Map<string, number>();
  private readonly byToken = new Map<string, number>();
  private readonly emails = new Map<string, string>();

  /**
   * `fixedOnReplay`: the shop becomes secure once the replay's fresh users register, as if a fix
   * had shipped between the attack and the PoC replay.
   */
  constructor(
    private secure = false,
    private readonly fixedOnReplay = false,
  ) {}

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
    if (pathname === '/rest/products/reviews' && request.method === 'POST') {
      const token = request.headers?.authorization?.replace('Bearer ', '') ?? '';
      const email = this.emails.get(token);
      if (email === undefined) return reply(401, '');
      if (this.secure && this.likedBy.includes(email)) return reply(403, '{"error":"Not allowed"}');
      this.likedBy.push(email);
      return reply(200, '{"status":"success"}');
    }
    if (pathname === '/rest/user/login' && request.method === 'POST') {
      const injected = (request.body ?? '').includes("'");
      if (injected && !this.secure) {
        return reply(200, JSON.stringify({ authentication: { token: STOLEN_JWT, bid: 1 } }));
      }
      // A real login; the secure shop throttles an account after 5 wrong passwords (F3.6).
      const { email, password } = JSON.parse(request.body ?? '{}') as {
        email?: string;
        password?: string;
      };
      const failures = this.failures.get(email ?? '') ?? 0;
      if (this.secure && failures >= 5) return reply(429, 'Too many requests');
      const account = email === undefined ? undefined : this.users.accounts.get(email);
      if (account !== undefined && account.password === password) {
        return reply(200, JSON.stringify({ authentication: { token: 'session', bid: 9 } }));
      }
      this.failures.set(email ?? '', failures + 1);
      return reply(401, 'Invalid email or password.');
    }
    return reply(404, 'Not found');
  }

  browser(): InMemoryBrowserAttack {
    return new InMemoryBrowserAttack(ORIGIN, [
      { template: `${ORIGIN}/#/search?q={payload}`, field: 'search', unsafe: !this.secure },
    ]);
  }

  target(): AttackTarget {
    const { users, baskets, byToken, emails, likedBy } = this;
    const secure = () => this.secure;
    return {
      users: {
        register: (label) => {
          if (this.fixedOnReplay && users.accounts.size >= 2) this.secure = true;
          return users.register(label);
        },
        login: async (user) => {
          const session = await users.login(user);
          byToken.set(session.token, session.basketId ?? 0);
          emails.set(session.token, user.email);
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
      businessLogic: {
        orderWithQuantity: (_session, quantity) =>
          Promise.resolve(
            secure() && quantity <= 0
              ? { step: { method: 'PUT', path: '/api/BasketItems/1', status: 400 }, order: null }
              : {
                  step: { method: 'PUT', path: '/api/BasketItems/1', status: 200 },
                  order: {
                    totalPrice: 1.99 * quantity,
                    deliveryPrice: 0,
                    discount: 0,
                    items: [{ price: 1.99, quantity }],
                  },
                },
          ),
        prepareOnceEffect: (session) =>
          Promise.resolve({
            name: 'review like',
            request: {
              method: 'POST',
              url: `${ORIGIN}/rest/products/reviews`,
              testType: 'race',
              body: '{"id":"r1"}',
            },
            readBack: () => Promise.resolve([...likedBy]),
            actor: session.user.email,
          }),
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
  readonly classes?: RedTeamClass[];
  readonly artifacts?: InMemoryArtifactStore;
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
    browser: shop.browser(),
    ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts }),
  }).execute({
    runId: RUN_ID,
    scope,
    origin: ORIGIN,
    classes: options.classes ?? ['idor', 'auth-bypass'],
    endpoints: options.surface ?? endpoints,
    surface: { ref: 'main', sha: 'c'.repeat(40) },
    findings: leads,
    budget: new Budget({ maxTokens: 1_000_000, maxEur: 1 }),
    ...(options.engine === undefined ? {} : { engine: options.engine }),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });
  const events = (await store.readRun(RUN_ID)).filter(isKnownEvent);
  return { result, events, gateway, shop, http };
}

describe('RunRedTeam deterministic engine', () => {
  const ALL: RedTeamClass[] = ['idor', 'auth-bypass', 'xss', 'business-logic'];

  it('finds all four classes, each confirmed by its oracle', async () => {
    const { result, events } = await run({ classes: ALL });

    expect([...new Set(result.findings.map((f) => f.testType))].sort()).toEqual([
      'auth-bypass',
      'business-logic',
      'idor',
      'xss',
    ]);
    const oracles = events.flatMap((e) =>
      e.type === 'attack.verdict' && e.payload.exploitable ? [e.payload.oracle] : [],
    );
    expect(new Set(oracles)).toEqual(
      new Set([
        'canary-leak',
        'authenticated-as',
        'script-executed',
        'price-mismatch',
        'duplicate-effect',
      ]),
    );
    // The negative order and the raced like are two findings on two endpoints.
    expect(
      result.findings
        .filter((f) => f.testType === 'business-logic')
        .map((f) => f.endpoint)
        .sort(),
    ).toEqual(['POST /rest/products/reviews', 'PUT /api/BasketItems/:id']);
  });

  it('finds nothing in a shop that escapes the search and refuses bad orders and repeat likes', async () => {
    const { result } = await run({ shop: new FakeShop(true), classes: ALL });

    expect(result.findings).toEqual([]);
  });

  it('skips XSS without a browser, and says so', async () => {
    const shop = new FakeShop();
    const http = new InMemoryScopedHttp((each) => shop.handle(each));
    const result = await new RunRedTeam({
      gateway: new ScriptedGateway([]),
      store: new InMemoryEventStore(),
      http,
      target: () => shop.target(),
    }).execute({
      runId: RUN_ID,
      scope,
      origin: ORIGIN,
      classes: ['xss'],
      endpoints,
      findings: [],
      budget: new Budget({ maxTokens: 1, maxEur: 1 }),
    });

    expect(result.findings).toEqual([]);
    expect(result.summary).toContain('Skipped: xss (no browser)');
  });

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

  it('records the surface it attacks and the endpoint of every attempt and finding (F3.10)', async () => {
    const { events } = await run();

    const mapped = events.flatMap((e) => (e.type === 'surface.mapped' ? [e.payload] : []));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({ side: 'variant', ref: 'main', sha: 'c'.repeat(40) });
    const routes = mapped[0]?.endpoints.map((e) => `${e.method} ${e.route}`) ?? [];
    expect(routes).toContain('GET /rest/basket/:id');

    const attempts = events.flatMap((e) => (e.type === 'attack.attempt' ? [e.payload] : []));
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((a) => a.endpoint !== undefined)).toBe(true);
    const findings = events.flatMap((e) => (e.type === 'finding.created' ? [e.payload] : []));
    for (const finding of findings) {
      const attempt = attempts.find((a) => a.attemptId === finding.attemptId);
      expect(finding.endpoint).toBeDefined();
      expect(attempt?.endpoint).toBe(finding.endpoint);
    }
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

  it('finds brute force on a login that never limits guesses, with its PoC (F3.6)', async () => {
    const { result, events, shop } = await run({ classes: ['brute-force'] });

    expect(result.findings).toMatchObject([
      {
        testType: 'brute-force',
        endpoint: 'POST /rest/user/login',
        poc: {
          class: 'brute-force',
          oracle: 'unthrottled-guessing',
          steps: { kind: 'login-guessing', path: '/rest/user/login', guesses: 20 },
        },
      },
    ]);
    const recorded = JSON.stringify(events);
    for (const user of shop.users.accounts.values()) expect(recorded).not.toContain(user.password);
  });

  it('finds no brute force on a login that throttles an account (F3.6)', async () => {
    const { result } = await run({ shop: new FakeShop(true), classes: ['brute-force'] });

    expect(result.findings).toEqual([]);
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

describe('RunRedTeam PoC confirmation (F3.4)', () => {
  const ALL: RedTeamClass[] = ['idor', 'auth-bypass', 'xss', 'business-logic'];

  it('saves each finding’s PoC, replays it with fresh users and confirms it', async () => {
    const artifacts = new InMemoryArtifactStore();
    const { result, events, shop } = await run({ classes: ALL, artifacts });

    expect(result.findings).toHaveLength(5);
    expect([...result.confirmed].sort()).toEqual(result.findings.map((f) => f.findingId).sort());
    expect(result.unconfirmed).toEqual([]);
    // The replay registered its own victim and attacker.
    expect(shop.users.accounts.size).toBe(4);
    const confirmations = events.flatMap((e) =>
      e.type === 'finding.confirmed' ? [e.payload] : [],
    );
    expect(confirmations.map((c) => c.pocRef).sort()).toEqual(
      result.findings.map((f) => pocKey(f.findingId)).sort(),
    );
    // The replay records attempts and verdicts, never a second finding.
    expect(events.filter((e) => e.type === 'finding.created')).toHaveLength(5);

    for (const finding of result.findings) {
      const bytes = await artifacts.get(RUN_ID, pocKey(finding.findingId));
      const text = new TextDecoder().decode(bytes);
      const poc = proofOfConceptSchema.parse(JSON.parse(text));
      expect(poc).toMatchObject({ target: 'juice-shop', class: finding.testType });
      // A PoC never carries a run's marker, a password or a token.
      expect(text).not.toContain(RUN_ID);
      expect(text).not.toContain(STOLEN_JWT);
      for (const user of shop.users.accounts.values()) expect(text).not.toContain(user.password);
    }
    const idor = result.findings.find((f) => f.testType === 'idor')?.poc.steps;
    expect(idor).toEqual({
      kind: 'idor',
      method: 'GET',
      route: '/rest/basket/:id',
      bind: { victim: 'basketId' },
    });
  });

  it('leaves a finding suspected when its PoC no longer reproduces', async () => {
    const { result, events } = await run({
      shop: new FakeShop(false, true),
      classes: ['idor', 'business-logic'],
      artifacts: new InMemoryArtifactStore(),
    });

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.confirmed).toEqual([]);
    expect(result.unconfirmed.map((u) => u.findingId).sort()).toEqual(
      result.findings.map((f) => f.findingId).sort(),
    );
    expect(result.unconfirmed[0]?.reason).toContain('did not reproduce');
    expect(events.filter((e) => e.type === 'finding.confirmed')).toEqual([]);
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
