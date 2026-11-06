import { describe, expect, it } from 'vitest';

import { InfrastructureError } from '../../domain/run/run-errors.js';
import { ScriptedBrowser } from '../browser/scripted-browser.js';
import {
  CONTRACT_ORDERS,
  describeOrderReaderContract,
} from '../../test-support/order-reader-contract.js';
import { InMemoryOrderReader } from './in-memory-order-reader.js';
import { ShopLabOrderReader } from './shoplab-order-reader.js';

const BASE_URL = 'http://janus-test-app:3100';

describeOrderReaderContract('InMemoryOrderReader', {
  create: () => {
    const reader = new InMemoryOrderReader();
    reader.set('with', CONTRACT_ORDERS);
    return Promise.resolve({ reader, withOrders: 'with', withoutOrders: 'without' });
  },
});

/** A fake ShopLab answering like the real one: /orders HTML, then one JSON per order. */
function shopLab(orders: typeof CONTRACT_ORDERS) {
  const links = orders.map(
    (order) => `<a href="/orders/${String(order.id)}">#${String(order.id)}</a>`,
  );
  const responses: Record<string, { status: number; body: string }> = {
    '/orders': { status: 200, body: `<table>${links.join('')}</table>` },
  };
  for (const order of orders) {
    responses[`/api/orders/${String(order.id)}`] = {
      status: 200,
      body: JSON.stringify({
        order: {
          ...order,
          userId: 'u1',
          paymentMethod: 'card',
          totalCents: 1789,
          items: order.items.map((item) => ({ ...item, productId: 'p', unitPriceCents: 1290 })),
        },
      }),
    };
  }
  return new ScriptedBrowser({}, responses);
}

describeOrderReaderContract('ShopLabOrderReader over a scripted ShopLab', {
  create: async () => {
    const withBrowser = shopLab(CONTRACT_ORDERS);
    const emptyBrowser = shopLab([]);
    const withOrders = await withBrowser.newSession({ baseUrl: BASE_URL });
    const emptySession = await emptyBrowser.newSession({ baseUrl: BASE_URL });
    const withReader = new ShopLabOrderReader(withBrowser);
    const emptyReader = new ShopLabOrderReader(emptyBrowser);
    // Two fake shops with their own session ids: route the empty shopper by a prefix.
    const reader = {
      read: (id: string) =>
        id.startsWith('empty:') ? emptyReader.read(id.slice(6)) : withReader.read(id),
    };
    return { reader, withOrders, withoutOrders: `empty:${emptySession}` };
  },
});

describe('ShopLabOrderReader', () => {
  it('treats a target that cannot be read as an infrastructure failure, not a failed task', async () => {
    const browser = new ScriptedBrowser({}, { '/orders': { status: 500, body: 'boom' } });
    const session = await browser.newSession({ baseUrl: BASE_URL });

    await expect(new ShopLabOrderReader(browser).read(session)).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });
});
