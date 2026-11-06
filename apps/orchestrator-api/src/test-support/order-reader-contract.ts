// Shared contract suite for OrderReaderPort: the in-memory fake and the ShopLab reader (over a
// scripted browser) run it in `pnpm test`; the ShopLab reader also runs against a real variant
// in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import type { OrderReaderPort } from '../domain/task/order-reader-port.js';
import type { OrderRecord } from '../domain/task/order-record.js';

export const CONTRACT_ORDERS: readonly OrderRecord[] = [
  {
    id: 6,
    items: [{ name: 'Taza de cerámica', quantity: 1 }],
    discountCents: 0,
    shippingAddress: 'Calle Sintética 1, 28001 Madrid',
  },
  {
    id: 9,
    items: [
      { name: 'Cuaderno A5 punteado', quantity: 2 },
      { name: 'Bolígrafo de gel (pack 3)', quantity: 1 },
    ],
    discountCents: 238,
    shippingAddress: 'Avenida Prueba 7, 41001 Sevilla',
  },
];

export interface OrderReaderContractHarness {
  /** A reader and a session whose shopper has exactly CONTRACT_ORDERS, and one with none. */
  readonly create: () => Promise<{
    reader: OrderReaderPort;
    withOrders: string;
    withoutOrders: string;
  }>;
}

export function describeOrderReaderContract(
  name: string,
  harness: OrderReaderContractHarness,
): void {
  describe(`OrderReaderPort contract: ${name}`, () => {
    it('reads every order of the shopper, newest first, with items, discount and address', async () => {
      const { reader, withOrders } = await harness.create();

      expect(await reader.read(withOrders)).toEqual(
        [...CONTRACT_ORDERS].sort((a, b) => b.id - a.id),
      );
    });

    it('reads no orders for a shopper who placed none', async () => {
      const { reader, withoutOrders } = await harness.create();

      expect(await reader.read(withoutOrders)).toEqual([]);
    });
  });
}
