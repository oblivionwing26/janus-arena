import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { SessionJob } from '../../domain/run/session-queue-port.js';
import type { SessionSpec } from '../../domain/run/session-spec.js';
import type { ScopePolicy } from '../../domain/scope/scope-policy.js';
import type { ScopedReply, ScopedRequest } from '../../domain/scope/scoped-http-port.js';
import { VERIFICATION_PATH } from '../../domain/scope/verified-scope.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryOwnershipTokens } from '../../infrastructure/scope/in-memory-ownership-tokens.js';
import { InMemoryScopedHttp } from '../../infrastructure/scope/in-memory-scoped-http.js';
import { VerifyOwnership } from '../scope/verify-ownership.js';
import { RunSaboteur } from './run-saboteur.js';
import { SaboteurScopes } from './saboteur-scopes.js';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const VARIANT_ID = 'run-aa-b';
const BASE = 'http://janus-shoplab-app:3000';
const policy: ScopePolicy = {
  target: 'shoplab',
  origins: [BASE],
  excludedPaths: [],
  allowedTests: ['browse', 'http-probe', 'brute-force', 'saturation'],
  maxRequestsPerSecond: 200,
};

interface Defenses {
  /** Requests a client may send before getting a 429; none when absent. */
  readonly perClient?: number;
  /** Attempts at one account before it is refused; none when absent. */
  readonly perAccount?: number;
}

/** A tiny ShopLab: counts per client and per account like its defenses do. */
function shop(tokens: InMemoryOwnershipTokens, defenses: Defenses) {
  const byClient = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const accounts = new Map<string, string>();
  const reply = (status: number, body = '{}'): ScopedReply => ({ status, headers: {}, body });
  return (request: ScopedRequest): ScopedReply => {
    const path = new URL(request.url).pathname;
    if (path === VERIFICATION_PATH) return reply(200, tokens.tokens.get(VARIANT_ID) ?? '');
    const client = request.headers?.['x-forwarded-for'] ?? 'direct';
    const seen = (byClient.get(client) ?? 0) + 1;
    byClient.set(client, seen);
    if (defenses.perClient !== undefined && seen > defenses.perClient) return reply(429);
    const body = JSON.parse(request.body ?? '{}') as { email?: string; password?: string };
    if (path === '/api/auth/register') {
      accounts.set(body.email ?? '', body.password ?? '');
      return reply(201);
    }
    if (path === '/api/auth/login') {
      const email = body.email ?? '';
      const tries = (byAccount.get(email) ?? 0) + 1;
      byAccount.set(email, tries);
      if (defenses.perAccount !== undefined && tries > defenses.perAccount) return reply(429);
      return accounts.get(email) === body.password ? reply(200) : reply(401);
    }
    return reply(200);
  };
}

function harness(defenses: Defenses) {
  const tokens = new InMemoryOwnershipTokens(new Set([VARIANT_ID]));
  const http = new InMemoryScopedHttp(shop(tokens, defenses));
  const store = new InMemoryEventStore();
  const scopes = new SaboteurScopes({
    verify: new VerifyOwnership({ tokens, http, store }),
    policyFor: () => policy,
  });
  const sleeps: number[] = [];
  const saboteur = new RunSaboteur({
    store,
    http,
    scopes,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
  return { saboteur, store, http, sleeps };
}

const job = (seed: number, patch: Partial<SessionSpec> = {}): SessionJob => ({
  runId: RUN_ID,
  target: 'shoplab',
  attempt: 1,
  variant: { key: 'b', variantId: VARIANT_ID, baseUrl: BASE },
  spec: {
    sessionIndex: seed,
    variant: 'b',
    kind: 'saboteur',
    seed,
    clientIp: `10.99.0.${String(seed + 1)}`,
    requestsPerSecond: 4,
    ...patch,
  },
});

const never = new AbortController().signal;

async function eventsOf(store: InMemoryEventStore) {
  return (await store.readRun(RUN_ID)).filter(isKnownEvent);
}

describe('RunSaboteur (F4.1)', () => {
  it('loads the shop at its pace as its own address, and the oracle says nobody pushed back', async () => {
    const { saboteur, store, http, sleeps } = harness({});

    expect(await saboteur.execute(job(0), never)).toEqual({ sessionIndex: 0, status: 'completed' });

    const events = await eventsOf(store);
    const attempts = events.filter((event) => event.type === 'attack.attempt');
    expect(attempts).toHaveLength(40);
    expect(attempts[0]?.actor.role).toBe('red-team');
    expect(attempts[0]?.payload).toMatchObject({
      testType: 'saturation',
      method: 'POST',
      path: '/api/auth/logout',
      status: 200,
    });
    const verdict = events.find((event) => event.type === 'attack.verdict');
    expect(verdict?.payload).toMatchObject({
      oracle: 'unthrottled-requests',
      exploitable: true,
      attemptId:
        attempts.at(-1)?.payload && (attempts.at(-1)?.payload as { attemptId: string }).attemptId,
    });
    // Every request carries the saboteur's address, and it waits a quarter of a second.
    const sent = http.sent.filter((request) => request.testType === 'saturation');
    expect(sent.every((request) => request.headers?.['x-forwarded-for'] === '10.99.0.1')).toBe(
      true,
    );
    expect(sleeps.every((ms) => ms <= 250)).toBe(true);
    const started = events.find((event) => event.type === 'session.started');
    expect(started?.payload).toMatchObject({
      kind: 'saboteur',
      role: 'saboteur',
      client: '10.99.0.1',
    });
    expect(events.some((event) => event.type === 'session.ended')).toBe(true);
    expect(events.some((event) => event.type === 'finding.created')).toBe(false);
  });

  it('is not exploitable when the shop refuses the client after its share', async () => {
    const { saboteur, store } = harness({ perClient: 15 });

    await saboteur.execute(job(0), never);

    const verdict = (await eventsOf(store)).find((event) => event.type === 'attack.verdict');
    expect(verdict?.payload).toMatchObject({ exploitable: false });
    expect((verdict?.payload as { evidence: string }).evidence).toContain('refused at request 16');
  });

  it('guesses at an account of its own, and a lockout makes it not exploitable', async () => {
    const open = harness({});
    await open.saboteur.execute(job(1), never);
    const locked = harness({ perAccount: 3 });
    await locked.saboteur.execute(job(1), never);

    const verdictOf = async (store: InMemoryEventStore) =>
      (await eventsOf(store)).find((event) => event.type === 'attack.verdict')?.payload;
    expect(await verdictOf(open.store)).toMatchObject({
      oracle: 'unthrottled-guessing',
      testType: 'brute-force',
      exploitable: true,
    });
    expect(await verdictOf(locked.store)).toMatchObject({ exploitable: false });
    const attempts = (await eventsOf(open.store)).filter(
      (event) => event.type === 'attack.attempt',
    );
    // The account, eight wrong passwords and the right one.
    expect(attempts).toHaveLength(10);
  });

  it('proves ownership once for the variant, however many saboteurs there are', async () => {
    const { saboteur, store } = harness({});

    await Promise.all([saboteur.execute(job(0), never), saboteur.execute(job(1), never)]);

    const verified = (await eventsOf(store)).filter((event) => event.type === 'scope.verified');
    expect(verified).toHaveLength(1);
  });

  it('stops when the run does, without a verdict', async () => {
    const { saboteur, store } = harness({});
    const stopped = AbortSignal.abort(new Error('stopped by user'));

    expect(await saboteur.execute(job(0), stopped)).toEqual({
      sessionIndex: 0,
      status: 'cancelled',
    });
    expect((await eventsOf(store)).some((event) => event.type === 'attack.verdict')).toBe(false);
  });

  it('refuses a target it has no plan for', async () => {
    const { saboteur } = harness({});

    await expect(saboteur.execute({ ...job(0), target: 'juice-shop' }, never)).rejects.toThrow(
      /saboteurs only run on ShopLab/,
    );
  });
});
