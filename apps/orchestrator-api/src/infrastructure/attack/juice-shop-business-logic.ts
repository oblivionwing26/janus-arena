import { newUlid } from '@janus/shared-kernel';
import { z } from 'zod';

import type {
  BusinessLogicPort,
  ManipulatedOrder,
  OnceEffect,
} from '../../domain/attack/business-logic-port.js';
import type { TestSession } from '../../domain/attack/test-user-port.js';
import type { ScopedHttpClient, ScopedReply } from '../../domain/scope/scoped-http-port.js';

// The product every flow uses: Juice Shop's first one, always in stock.
const PRODUCT = 1;

const basket = z.object({
  data: z.object({
    Products: z.array(z.object({ id: z.int(), BasketItem: z.object({ id: z.int() }) })),
  }),
});
const added = z.object({ data: z.object({ id: z.int() }) });
const placed = z.object({ orderConfirmation: z.string() });
const history = z.object({
  data: z.array(
    z.object({
      orderId: z.string(),
      totalPrice: z.number(),
      deliveryPrice: z.number(),
      promotionalAmount: z.union([z.string(), z.number()]),
      products: z.array(z.object({ price: z.number(), quantity: z.number() })),
    }),
  ),
});
const reviews = z.object({
  data: z.array(z.object({ _id: z.string(), message: z.string(), likedBy: z.array(z.string()) })),
});

function json(reply: ScopedReply): unknown {
  try {
    return JSON.parse(reply.body);
  } catch {
    return undefined;
  }
}

/**
 * Juice Shop's own business flows (F3.3), behind BusinessLogicPort: put a product in the basket,
 * set its quantity, check out and read the order back; and a review whose likes can be raced.
 * Only the request that carries the manipulation is sent as `business-logic`; the setup and the
 * reads are probes. Every request goes through the run's guarded client.
 */
export class JuiceShopBusinessLogic implements BusinessLogicPort {
  constructor(
    private readonly client: ScopedHttpClient,
    private readonly origin: string,
  ) {}

  async orderWithQuantity(session: TestSession, quantity: number): Promise<ManipulatedOrder> {
    const bid = String(session.basketId ?? 0);
    const item = await this.basketItem(session, bid);
    const path = `/api/BasketItems/${String(item)}`;
    const changed = await this.send(session, 'PUT', path, { quantity }, 'business-logic');
    const step = { method: 'PUT' as const, path, status: changed.status };
    if (changed.status !== 200) return { step, order: null };

    const checkout = await this.send(session, 'POST', `/rest/basket/${bid}/checkout`, {});
    const confirmation = placed.safeParse(json(checkout));
    if (checkout.status !== 200 || !confirmation.success) return { step, order: null };
    const orders = history.safeParse(json(await this.send(session, 'GET', '/rest/order-history')));
    const order = orders.success
      ? orders.data.data.find((each) => each.orderId === confirmation.data.orderConfirmation)
      : undefined;
    if (order === undefined) return { step, order: null };
    return {
      step,
      order: {
        totalPrice: order.totalPrice,
        deliveryPrice: order.deliveryPrice,
        discount: Number(order.promotionalAmount),
        items: order.products,
      },
    };
  }

  async prepareOnceEffect(session: TestSession): Promise<OnceEffect | null> {
    const message = `Janus review ${newUlid()}`;
    const created = await this.send(session, 'PUT', `/rest/products/${String(PRODUCT)}/reviews`, {
      message,
      author: session.user.email,
    });
    if (created.status !== 201) return null;
    const find = async () => {
      const listed = reviews.safeParse(
        json(await this.send(session, 'GET', `/rest/products/${String(PRODUCT)}/reviews`)),
      );
      return listed.success ? listed.data.data.find((each) => each.message === message) : undefined;
    };
    const review = await find();
    if (review === undefined) return null;
    return {
      name: 'review like',
      request: {
        method: 'POST',
        url: `${this.origin}/rest/products/reviews`,
        testType: 'race',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: review._id }),
      },
      readBack: async () => (await find())?.likedBy ?? [],
      actor: session.user.email,
    };
  }

  /** The basket item holding the product, added when the basket does not have it yet. */
  private async basketItem(session: TestSession, bid: string): Promise<number> {
    const current = basket.safeParse(json(await this.send(session, 'GET', `/rest/basket/${bid}`)));
    const existing = current.success
      ? current.data.data.Products.find((product) => product.id === PRODUCT)?.BasketItem.id
      : undefined;
    if (existing !== undefined) return existing;
    const reply = await this.send(session, 'POST', '/api/BasketItems', {
      ProductId: PRODUCT,
      BasketId: Number(bid),
      quantity: 1,
    });
    const parsed = added.safeParse(json(reply));
    if (reply.status !== 200 || !parsed.success) {
      throw new Error(`Juice Shop did not add the product to the basket: ${String(reply.status)}`);
    }
    return parsed.data.data.id;
  }

  private send(
    session: TestSession,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    testType: 'http-probe' | 'business-logic' = 'http-probe',
  ): Promise<ScopedReply> {
    return this.client.send({
      method,
      url: `${this.origin}${path}`,
      testType,
      headers: {
        authorization: `Bearer ${session.token}`,
        cookie: `token=${session.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
}
