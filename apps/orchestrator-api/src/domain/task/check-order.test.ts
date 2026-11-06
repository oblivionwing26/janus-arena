import { describe, expect, it } from 'vitest';

import { checkOrder } from './check-order.js';
import type { OrderRecord } from './order-record.js';

const order = (id: number, patch: Partial<OrderRecord> = {}): OrderRecord => ({
  id,
  items: [{ name: 'Taza de cerámica', quantity: 1 }],
  discountCents: 0,
  shippingAddress: 'Calle Sintética 1, 28001 Madrid',
  ...patch,
});

describe('checkOrder', () => {
  it('passes when one order has the products and quantities asked for', () => {
    const verdict = checkOrder([order(6)], {
      items: [{ product: 'Taza de cerámica', quantity: 1 }],
    });

    expect(verdict).toEqual({
      passed: true,
      checks: [{ check: 'quantity of Taza de cerámica = 1', passed: true }],
      orderId: 6,
    });
  });

  it('fails with the reason when the quantity is wrong', () => {
    const verdict = checkOrder(
      [order(7, { items: [{ name: 'Cuaderno A5 punteado', quantity: 1 }] })],
      { items: [{ product: 'Cuaderno A5 punteado', quantity: 2 }] },
    );

    expect(verdict).toEqual({
      passed: false,
      checks: [{ check: 'quantity of Cuaderno A5 punteado = 2', passed: false, detail: 'found 1' }],
      orderId: 7,
    });
  });

  it('checks every product of a multi-item task in the same order', () => {
    const both = order(8, {
      items: [
        { name: 'Taza de cerámica', quantity: 1 },
        { name: 'Bolígrafo de gel (pack 3)', quantity: 1 },
      ],
    });
    const expectation = {
      items: [
        { product: 'Taza de cerámica', quantity: 1 },
        { product: 'Bolígrafo de gel (pack 3)', quantity: 1 },
      ],
    };

    expect(checkOrder([both], expectation).passed).toBe(true);
    // Two separate orders do not make one order with both.
    expect(
      checkOrder(
        [order(9), order(10, { items: [{ name: 'Bolígrafo de gel (pack 3)', quantity: 1 }] })],
        expectation,
      ).passed,
    ).toBe(false);
  });

  it('requires a discount when the task uses a coupon', () => {
    const expectation = { items: [{ product: 'Taza de cerámica', quantity: 1 }], discounted: true };

    expect(checkOrder([order(11, { discountCents: 129 })], expectation).passed).toBe(true);
    expect(checkOrder([order(12)], expectation).checks.at(-1)).toEqual({
      check: 'a discount was applied',
      passed: false,
      detail: 'no discount on the order',
    });
  });

  it('requires the exact shipping address when the task gives one', () => {
    const expectation = {
      items: [{ product: 'Taza de cerámica', quantity: 1 }],
      shippingAddress: 'Avenida Prueba 7, 41001 Sevilla',
    };

    expect(
      checkOrder([order(13, { shippingAddress: 'Avenida Prueba 7, 41001 Sevilla ' })], expectation)
        .passed,
    ).toBe(true);
    expect(checkOrder([order(14)], expectation).passed).toBe(false);
  });

  it('fails clearly when no order was placed, and accepts any satisfying order', () => {
    expect(checkOrder([], { items: [{ product: 'Taza de cerámica', quantity: 1 }] })).toEqual({
      passed: false,
      checks: [{ check: 'an order was placed', passed: false, detail: 'no orders' }],
    });
    const verdict = checkOrder(
      [order(16, { items: [{ name: 'Agenda semanal 2027', quantity: 1 }] }), order(15)],
      { items: [{ product: 'Taza de cerámica', quantity: 1 }] },
    );
    expect(verdict.orderId).toBe(15);
  });
});
