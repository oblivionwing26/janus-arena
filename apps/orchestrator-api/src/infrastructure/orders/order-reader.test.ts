import { describe, expect, it } from 'vitest';

import { InfrastructureError } from '../../domain/run/run-errors.js';
import { ScriptedBrowser } from '../browser/scripted-browser.js';
import {
  CONTRACT_ORDERS,
  describeOrderReaderContract,
} from '../../test-support/order-reader-contract.js';
import { InMemoryOrderReader } from './in-memory-order-reader.js';
import { JuiceShopOrderReader } from './juice-shop-order-reader.js';
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

/**
 * A fake Juice Shop answering like the real one (F3.5a): the order history, oldest first, with
 * its promotional amount in euros and an address id; then each address. Answers only reads
 * that carry the shopper's token as a bearer header.
 */
function juiceShop(orders: typeof CONTRACT_ORDERS) {
  const responses: Record<string, { status: number; body: string }> = {
    '/rest/order-history': {
      status: 200,
      body: JSON.stringify({
        status: 'success',
        data: [...orders]
          .sort((a, b) => Number(a.id) - Number(b.id))
          .map((order, index) => ({
            orderId: String(order.id),
            totalPrice: 9.99,
            products: order.items.map((item) => ({ ...item, price: 1.99, total: 1.99 })),
            promotionalAmount: (order.discountCents / 100).toFixed(2),
            addressId: index + 1,
          })),
      }),
    },
  };
  [...orders]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((order, index) => {
      const [street, place] = order.shippingAddress.split(', ');
      const [zip, ...city] = (place ?? '').split(' ');
      responses[`/api/Addresss/${String(index + 1)}`] = {
        status: 200,
        body: JSON.stringify({
          status: 'success',
          data: { streetAddress: street, zipCode: zip, city: city.join(' '), country: 'Spain' },
        }),
      };
    });
  return new ScriptedBrowser({}, responses);
}

describeOrderReaderContract('JuiceShopOrderReader over a scripted Juice Shop', {
  create: async () => {
    const withBrowser = juiceShop(CONTRACT_ORDERS);
    const emptyBrowser = juiceShop([]);
    const withOrders = await withBrowser.newSession({ baseUrl: BASE_URL });
    const emptySession = await emptyBrowser.newSession({ baseUrl: BASE_URL });
    const withReader = new JuiceShopOrderReader(withBrowser);
    const emptyReader = new JuiceShopOrderReader(emptyBrowser);
    const reader = {
      read: (id: string) =>
        id.startsWith('empty:') ? emptyReader.read(id.slice(6)) : withReader.read(id),
    };
    return { reader, withOrders, withoutOrders: `empty:${emptySession}` };
  },
});

describe('JuiceShopOrderReader', () => {
  it('sends the shopper’s token cookie as a bearer header, the only way Juice Shop reads it', async () => {
    const browser = juiceShop(CONTRACT_ORDERS);
    const session = await browser.newSession({ baseUrl: BASE_URL });
    await new JuiceShopOrderReader(browser).read(session);

    expect(browser.fetches.length).toBeGreaterThan(0);
    expect(browser.fetches.every((each) => each.options.bearerFromCookie === 'token')).toBe(true);
  });

  it('reads no orders for a visitor who never logged in', async () => {
    const browser = new ScriptedBrowser(
      {},
      { '/rest/order-history': { status: 500, body: 'Blocked illegal activity' } },
    );
    const session = await browser.newSession({ baseUrl: BASE_URL });

    expect(await new JuiceShopOrderReader(browser).read(session)).toEqual([]);
  });

  it('treats an unreadable history as an infrastructure failure, not a failed task', async () => {
    const browser = new ScriptedBrowser({}, { '/rest/order-history': { status: 503, body: '' } });
    const session = await browser.newSession({ baseUrl: BASE_URL });

    await expect(new JuiceShopOrderReader(browser).read(session)).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });
});
