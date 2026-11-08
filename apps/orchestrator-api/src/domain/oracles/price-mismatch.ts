import { verdict, type OracleVerdict } from './oracle-verdict.js';

export interface PricedOrder {
  readonly totalPrice: number;
  readonly deliveryPrice: number;
  readonly discount: number;
  readonly items: readonly { readonly price: number; readonly quantity: number }[];
}

const CENT = 0.005;

/**
 * Business logic (F3.2): the shop accepted an order it should not have: a negative total, an
 * item with no positive quantity, or a total that is not the sum of its items, plus delivery,
 * minus discount.
 */
export function priceMismatch(order: PricedOrder): OracleVerdict {
  if (order.totalPrice < 0) {
    return verdict(true, `the order total is negative: ${order.totalPrice.toFixed(2)}`);
  }
  const odd = order.items.find((item) => !(item.quantity > 0));
  if (odd !== undefined) {
    return verdict(true, `an item was ordered with quantity ${String(odd.quantity)}`);
  }
  const expected =
    order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) +
    order.deliveryPrice -
    order.discount;
  if (Math.abs(expected - order.totalPrice) > CENT) {
    return verdict(
      true,
      `the total is ${order.totalPrice.toFixed(2)} but its items add up to ${expected.toFixed(2)}`,
    );
  }
  return verdict(false, `the total ${order.totalPrice.toFixed(2)} matches its items`);
}
