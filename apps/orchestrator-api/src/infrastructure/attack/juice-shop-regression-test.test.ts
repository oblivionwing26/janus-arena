import type { ProofOfConcept } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { juiceShopRegressionTest } from './juice-shop-regression-test.js';

const FINDING = '01JC0F27B7E0000000000000FF';
const IDOR: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};
const NEGATIVE: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'business-logic',
  oracle: 'price-mismatch',
  endpoint: 'PUT /api/BasketItems/:id',
  steps: { kind: 'order-quantity', quantity: -1 },
};

describe('juiceShopRegressionTest (F3.5, V2)', () => {
  it('turns the basket IDOR into an API test in Juice Shop’s own style', () => {
    const test = juiceShopRegressionTest(IDOR, FINDING);

    expect(test?.path).toBe(`test/api/janus-regression-${FINDING.toLowerCase()}.test.ts`);
    expect(test?.name).toBe(
      `test/api/janus-regression-${FINDING.toLowerCase()}.test.ts > janus regression ${FINDING} > GET /rest/basket/:id > does not give a user another user's data`,
    );
    const source = test?.source ?? '';
    expect(source).toContain("from './helpers/setup'");
    expect(source).toContain('request(app).get(`/rest/basket/${String(victim.bid)}`)');
    // Fresh synthetic users, never Juice Shop's seeded accounts or passwords.
    expect(source).toContain('@janus.test');
    expect(source).not.toMatch(/juice-sh\.op|ncc-1701/);
  });

  it('turns the negative quantity into a test that the stored quantity stays positive', () => {
    const source = juiceShopRegressionTest(NEGATIVE, FINDING)?.source ?? '';

    expect(source).toContain('.put(`/api/BasketItems/${String(item)}`)');
    expect(source).toContain('send({ quantity: -1 })');
    expect(source).toContain('assert.ok(stored > 0');
  });

  it('turns the brute force into a test that guessing an account gets stopped (F3.6)', () => {
    const guessing: ProofOfConcept = {
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
    const test = juiceShopRegressionTest(guessing, FINDING);
    const source = test?.source ?? '';

    expect(test?.name).toContain("POST /rest/user/login > stops guessing at an account's password");
    expect(source).toContain('for (let guess = 0; guess < 20; guess++)');
    expect(source).toContain(".post('/rest/user/login')");
    expect(source).toContain('assert.ok(!unthrottled');
  });

  it('has no generated test for the other kinds of PoC yet', () => {
    expect(
      juiceShopRegressionTest({ ...IDOR, steps: { kind: 'once-effect-race', size: 5 } }, FINDING),
    ).toBeNull();
  });
});
