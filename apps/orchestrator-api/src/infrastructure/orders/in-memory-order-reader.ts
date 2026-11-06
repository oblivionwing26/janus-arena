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
    return Promise.resolve([...(this.orders.get(sessionId) ?? [])].sort((a, b) => b.id - a.id));
  }
}
