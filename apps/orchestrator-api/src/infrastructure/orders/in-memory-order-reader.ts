import type { OrderReaderPort } from '../../domain/task/order-reader-port.js';
import type { OrderRecord } from '../../domain/task/order-record.js';

/** Fake order reader for tests: the orders each session's shopper has, given in code. */
export class InMemoryOrderReader implements OrderReaderPort {
  private readonly orders = new Map<string, OrderRecord[]>();

  /** Orders of a session's shopper (any order; read() returns them newest first). */
  set(sessionId: string, orders: readonly OrderRecord[]): void {
    this.orders.set(sessionId, [...orders]);
  }

  read(sessionId: string): Promise<OrderRecord[]> {
    const orders = [...(this.orders.get(sessionId) ?? [])];
    // Numeric ids grow with time; string ids (Juice Shop) carry no order: newest set last.
    return Promise.resolve(
      orders.every((order) => typeof order.id === 'number')
        ? orders.sort((a, b) => Number(b.id) - Number(a.id))
        : orders.reverse(),
    );
  }
}
