import type { OrderRecord } from './order-record.js';

/** A canary looks like this, so any session's can be told from the text around it. */
const CANARY = /CNR-[A-Z0-9]{6}/g;

/**
 * The marker one legitimate session of a Launch Day run puts in its shipping address (F4.1): an
 * invented code that depends only on the run and the session, so a pair does not share one and a
 * retry gets its own. It is no secret: its only use is to show up where it should not.
 */
export function canaryFor(runId: string, agentId: string): string {
  // FNV-1a: a marker needs to differ between sessions, not to be unguessable.
  let hash = 0x811c9dc5;
  for (const char of `${runId}:${agentId}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return `CNR-${(hash % 36 ** 6).toString(36).toUpperCase().padStart(6, '0')}`;
}

export interface Contamination {
  readonly orderId: number | string;
  /** The canary of another session that the order carries. */
  readonly canary: string;
}

/**
 * The orders a session read that carry a canary other than its own. A shopper only sees their own
 * orders, so none is expected: one means the sessions of the run were not kept apart, and the
 * success numbers of that run cannot be trusted.
 */
export function foreignCanaries(
  orders: readonly Pick<OrderRecord, 'id' | 'shippingAddress'>[],
  own: string,
): Contamination[] {
  return orders.flatMap((order) =>
    (order.shippingAddress.match(CANARY) ?? [])
      .filter((canary) => canary !== own)
      .map((canary) => ({ orderId: order.id, canary })),
  );
}
