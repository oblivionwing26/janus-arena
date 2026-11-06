import type { OrderRecord } from './order-record.js';

/**
 * Reads the orders of the shopper signed in to a browser session, through the target's own
 * pages and API, as that shopper (F1.9 oracle). Every adapter must pass
 * src/test-support/order-reader-contract.ts.
 */
export interface OrderReaderPort {
  /** Newest first. Throws InfrastructureError when the target cannot be read. */
  read(sessionId: string): Promise<OrderRecord[]>;
}

export const ORDER_READER_PORT = Symbol('OrderReaderPort');
