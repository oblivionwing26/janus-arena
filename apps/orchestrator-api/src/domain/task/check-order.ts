import type { OrderRecord } from './order-record.js';
import type { TaskExpectation } from './task-spec.js';

export interface TaskCheck {
  readonly check: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface TaskVerdict {
  readonly passed: boolean;
  readonly checks: readonly TaskCheck[];
  /** The order that satisfied the task, or the newest one checked. */
  readonly orderId?: number;
}

function checksFor(order: OrderRecord, expect: TaskExpectation): TaskCheck[] {
  const checks: TaskCheck[] = expect.items.map(({ product, quantity }) => {
    const found = order.items.find((item) => item.name === product)?.quantity ?? 0;
    return {
      check: `quantity of ${product} = ${String(quantity)}`,
      passed: found === quantity,
      ...(found === quantity ? {} : { detail: `found ${String(found)}` }),
    };
  });
  if (expect.discounted === true) {
    checks.push({
      check: 'a discount was applied',
      passed: order.discountCents > 0,
      ...(order.discountCents > 0 ? {} : { detail: 'no discount on the order' }),
    });
  }
  if (expect.shippingAddress !== undefined) {
    const same = order.shippingAddress.trim() === expect.shippingAddress.trim();
    checks.push({
      check: `shipped to ${expect.shippingAddress}`,
      passed: same,
      ...(same ? {} : { detail: `shipped to ${order.shippingAddress}`.slice(0, 300) }),
    });
  }
  return checks;
}

/**
 * Did the shopper end up with an order that does what the task asks (F1.9)? Any one of their
 * orders may satisfy it; when none does, the newest order's checks say why.
 */
export function checkOrder(orders: readonly OrderRecord[], expect: TaskExpectation): TaskVerdict {
  const newest = orders[0];
  if (newest === undefined) {
    return {
      passed: false,
      checks: [{ check: 'an order was placed', passed: false, detail: 'no orders' }],
    };
  }
  for (const order of orders) {
    const checks = checksFor(order, expect);
    if (checks.every((check) => check.passed)) return { passed: true, checks, orderId: order.id };
  }
  return { passed: false, checks: checksFor(newest, expect), orderId: newest.id };
}
