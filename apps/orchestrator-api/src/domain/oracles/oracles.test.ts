import { describe, expect, it } from 'vitest';

import { authenticatedAs } from './authenticated-as.js';
import { canaryLeak } from './canary-leak.js';
import { duplicateEffect } from './duplicate-effect.js';
import { priceMismatch } from './price-mismatch.js';
import { scriptExecuted } from './script-executed.js';

const basket = (userId: number, products: string[]) =>
  JSON.stringify({
    status: 'success',
    data: { id: 7, UserId: userId, Products: products.map((name) => ({ name })) },
  });

describe('canaryLeak', () => {
  const owner = { userId: 21, canaries: ['Apple Juice (1000ml)'] };

  it('finds the owner’s basket, with its canary, in the viewer’s response', () => {
    const result = canaryLeak({
      owner,
      viewer: { userId: 22 },
      response: { status: 200, body: basket(21, ['Apple Juice (1000ml)']) },
    });
    expect(result).toEqual({
      exploitable: true,
      evidence: 'user 22 received a record of user 21 holding "Apple Juice (1000ml)"',
    });
  });

  it('is not a leak when the viewer gets its own basket or a refusal', () => {
    expect(
      canaryLeak({
        owner,
        viewer: { userId: 22 },
        response: { status: 200, body: basket(22, ['Apple Juice (1000ml)']) },
      }).exploitable,
    ).toBe(false);
    expect(
      canaryLeak({ owner, viewer: { userId: 22 }, response: { status: 401, body: '' } })
        .exploitable,
    ).toBe(false);
    expect(
      canaryLeak({
        owner,
        viewer: { userId: 21 },
        response: { status: 200, body: basket(21, ['Apple Juice (1000ml)']) },
      }).exploitable,
    ).toBe(false);
  });

  it('typical false positive: another user’s empty basket leaks none of the owner’s data', () => {
    const result = canaryLeak({
      owner,
      viewer: { userId: 22 },
      response: { status: 200, body: basket(21, []) },
    });
    expect(result.exploitable).toBe(false);
    expect(result.evidence).toContain('canaries');
  });
});

describe('authenticatedAs', () => {
  const known = new Map([['janus-a@janus.test', 'right-password']]);

  it('flags a session for an account that was not asked for (SQL injection login)', () => {
    const result = authenticatedAs({
      sessionEmail: 'admin@juice-sh.op',
      submitted: { email: "' OR 1=1--", password: 'anything' },
      known,
    });
    expect(result.exploitable).toBe(true);
    expect(result.evidence).not.toContain('anything');
  });

  it('flags a known account opened with the wrong password', () => {
    const result = authenticatedAs({
      sessionEmail: 'janus-a@janus.test',
      submitted: { email: 'janus-a@janus.test', password: 'Tr0ub4dor-guess' },
      known,
    });
    expect(result.exploitable).toBe(true);
    expect(result.evidence).not.toContain('Tr0ub4dor');
  });

  it('is not a bypass when a user logs in with its own credentials, or nothing opens', () => {
    expect(
      authenticatedAs({
        sessionEmail: 'janus-a@janus.test',
        submitted: { email: 'janus-a@janus.test', password: 'right-password' },
        known,
      }).exploitable,
    ).toBe(false);
    expect(
      authenticatedAs({
        sessionEmail: null,
        submitted: { email: "' OR 1=1--", password: 'x' },
        known,
      }).exploitable,
    ).toBe(false);
  });

  it('typical false positive: the target answering in another case is the same account', () => {
    expect(
      authenticatedAs({
        sessionEmail: 'Janus-A@Janus.Test',
        submitted: { email: 'janus-a@janus.test', password: 'right-password' },
        known,
      }).exploitable,
    ).toBe(false);
  });
});

describe('scriptExecuted', () => {
  const marker = 'janus-01JC0F28CNS0000000000000AA';
  const dialog = (message: string) => ({ kind: 'alert', message, url: 'http://shop/#/search' });

  it('sees the run’s marker in a dialog', () => {
    expect(scriptExecuted([dialog('xss'), dialog(marker)], marker).exploitable).toBe(true);
  });

  it('is not XSS when no dialog opened', () => {
    expect(scriptExecuted([], marker).exploitable).toBe(false);
  });

  it('typical false positive: a dialog the page opens by itself, with other text', () => {
    expect(
      scriptExecuted([dialog('Are you sure?'), dialog(`${marker}x`)], marker).exploitable,
    ).toBe(false);
  });

  it('refuses a marker short enough to appear by chance', () => {
    expect(scriptExecuted([dialog('xss')], 'xss').exploitable).toBe(false);
  });
});

describe('priceMismatch', () => {
  const item = { price: 1.99, quantity: 2 };

  it('flags a negative total (negative quantity in the basket)', () => {
    expect(
      priceMismatch({
        totalPrice: -197.01,
        deliveryPrice: 1.99,
        discount: 0,
        items: [{ price: 1.99, quantity: -100 }],
      }),
    ).toEqual({ exploitable: true, evidence: 'the order total is negative: -197.01' });
  });

  it('flags a zero quantity and a total that does not add up', () => {
    expect(
      priceMismatch({
        totalPrice: 1.99,
        deliveryPrice: 1.99,
        discount: 0,
        items: [{ price: 5, quantity: 0 }],
      }).exploitable,
    ).toBe(true);
    expect(
      priceMismatch({ totalPrice: 1, deliveryPrice: 0, discount: 0, items: [item] }).exploitable,
    ).toBe(true);
  });

  it('accepts an honest order with delivery and a discount', () => {
    expect(
      priceMismatch({ totalPrice: 4.97, deliveryPrice: 1.99, discount: 1.0, items: [item] })
        .exploitable,
    ).toBe(false);
  });

  it('typical false positive: rounding to the cent is not a mismatch', () => {
    expect(
      priceMismatch({
        totalPrice: 0.3,
        deliveryPrice: 0,
        discount: 0,
        items: [
          { price: 0.1, quantity: 1 },
          { price: 0.2, quantity: 1 },
        ],
      }).exploitable,
    ).toBe(false);
  });
});

describe('duplicateEffect', () => {
  it('flags the same actor counted more than once', () => {
    expect(
      duplicateEffect(
        ['b@janus.test', 'a@janus.test', 'b@janus.test', 'b@janus.test'],
        'b@janus.test',
      ),
    ).toEqual({
      exploitable: true,
      evidence: 'b@janus.test appears 3 times where at most 1 is allowed',
    });
  });

  it('accepts one effect per actor', () => {
    expect(duplicateEffect(['a@janus.test', 'b@janus.test'], 'b@janus.test').exploitable).toBe(
      false,
    );
  });

  it('typical false positive: many different actors are not a duplicate', () => {
    expect(
      duplicateEffect(['a@janus.test', 'c@janus.test', 'd@janus.test'], 'b@janus.test').exploitable,
    ).toBe(false);
  });
});

describe('scriptExecuted evidence', () => {
  it('names the page without repeating the payload in its query', () => {
    const marker = 'janus-01JC0F28CNS0000000000000AA';
    const result = scriptExecuted(
      [{ kind: 'alert', message: marker, url: 'http://shop/#/search?q=%3Ciframe%3E' }],
      marker,
    );

    expect(result.evidence).toBe(
      `a dialog (alert) showed the marker ${marker} on http://shop/#/search`,
    );
  });
});
