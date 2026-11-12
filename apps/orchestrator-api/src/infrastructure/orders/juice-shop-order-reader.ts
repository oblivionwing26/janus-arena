import { z } from 'zod';

import type { BrowserPort } from '../../domain/browser/browser-port.js';
import { InfrastructureError } from '../../domain/run/run-errors.js';
import type { OrderReaderPort } from '../../domain/task/order-reader-port.js';
import type { OrderRecord } from '../../domain/task/order-record.js';

const historySchema = z.object({
  data: z.array(
    z.object({
      orderId: z.string().min(1),
      products: z.array(z.object({ name: z.string(), quantity: z.number() })),
      promotionalAmount: z.union([z.string(), z.number()]).nullable().optional(),
      addressId: z.union([z.string(), z.number()]).nullable().optional(),
    }),
  ),
});
const addressSchema = z.object({
  data: z.object({ streetAddress: z.string(), zipCode: z.string(), city: z.string() }),
});

// Juice Shop's API reads the session token from this header, never from the cookie it sets.
const BEARER = { bearerFromCookie: 'token' } as const;
const MAX_ORDERS = 20;

/**
 * OWASP Juice Shop's orders, as the signed-in shopper sees them (F3.5a oracle): its order
 * history, then each order's delivery address. Juice Shop's API only takes the session token as
 * a bearer header, so the browser sends the shopper's own `token` cookie that way. Only reads;
 * never acts on the shop.
 */
export class JuiceShopOrderReader implements OrderReaderPort {
  constructor(private readonly browser: BrowserPort) {}

  async read(sessionId: string): Promise<OrderRecord[]> {
    const history = await this.browser.fetchText(sessionId, '/rest/order-history', BEARER);
    // No session yet (the shopper never logged in): no orders to read.
    if (history.status === 401 || history.status === 500) return [];
    if (history.status !== 200) {
      throw new InfrastructureError(`Juice Shop order history answered ${String(history.status)}`);
    }
    const parsed = historySchema.safeParse(JSON.parse(history.body));
    if (!parsed.success) {
      throw new InfrastructureError('Juice Shop order history has an unexpected shape');
    }
    // The history lists orders as they were placed: newest last.
    const orders = parsed.data.data.slice(-MAX_ORDERS).reverse();
    const addresses = new Map<string, string>();
    const records: OrderRecord[] = [];
    for (const order of orders) {
      const addressId =
        order.addressId === null || order.addressId === undefined ? '' : String(order.addressId);
      if (addressId !== '' && !addresses.has(addressId)) {
        addresses.set(addressId, await this.address(sessionId, addressId));
      }
      records.push({
        id: order.orderId,
        items: order.products.map(({ name, quantity }) => ({ name, quantity })),
        discountCents: Math.round(Number(order.promotionalAmount ?? 0) * 100),
        shippingAddress: addresses.get(addressId) ?? '',
      });
    }
    return records;
  }

  /** `Street 1, 28001 City`, the same shape ShopLab gives its addresses. */
  private async address(sessionId: string, id: string): Promise<string> {
    const reply = await this.browser.fetchText(sessionId, `/api/Addresss/${id}`, BEARER);
    const parsed = reply.status === 200 ? addressSchema.safeParse(JSON.parse(reply.body)) : null;
    if (parsed?.success !== true) return '';
    const { streetAddress, zipCode, city } = parsed.data.data;
    return `${streetAddress}, ${zipCode} ${city}`;
  }
}
