import { z } from 'zod';

import type { BrowserPort } from '../../domain/browser/browser-port.js';
import { InfrastructureError } from '../../domain/run/run-errors.js';
import type { OrderReaderPort } from '../../domain/task/order-reader-port.js';
import type { OrderRecord } from '../../domain/task/order-record.js';

const orderResponseSchema = z.object({
  order: z.object({
    id: z.int().positive(),
    shippingAddress: z.string(),
    discountCents: z.int().min(0),
    items: z.array(z.object({ name: z.string(), quantity: z.int().positive() })),
  }),
});

const ORDER_LINK = /href="\/orders\/(\d+)"/g;
const MAX_ORDERS = 20;

/**
 * ShopLab's orders, as the signed-in shopper sees them (F1.9 oracle): the order ids linked from
 * /orders, then GET /api/orders/<id> for each. Only reads; never acts on the shop.
 */
export class ShopLabOrderReader implements OrderReaderPort {
  constructor(private readonly browser: BrowserPort) {}

  async read(sessionId: string): Promise<OrderRecord[]> {
    const list = await this.browser.fetchText(sessionId, '/orders');
    if (list.status !== 200) {
      throw new InfrastructureError(`ShopLab /orders answered ${String(list.status)}`);
    }
    const ids = [...new Set([...list.body.matchAll(ORDER_LINK)].map((match) => Number(match[1])))]
      .sort((a, b) => b - a)
      .slice(0, MAX_ORDERS);
    const orders: OrderRecord[] = [];
    for (const id of ids) {
      const response = await this.browser.fetchText(sessionId, `/api/orders/${String(id)}`);
      if (response.status !== 200) {
        throw new InfrastructureError(
          `ShopLab order ${String(id)} answered ${String(response.status)}`,
        );
      }
      const parsed = orderResponseSchema.safeParse(JSON.parse(response.body));
      if (!parsed.success) {
        throw new InfrastructureError(`ShopLab order ${String(id)} has an unexpected shape`);
      }
      const { order } = parsed.data;
      orders.push({
        id: order.id,
        items: order.items.map(({ name, quantity }) => ({ name, quantity })),
        discountCents: order.discountCents,
        shippingAddress: order.shippingAddress,
      });
    }
    return orders;
  }
}
