/** An order as the target reports it to the shopper who placed it. */
export interface OrderRecord {
  readonly id: number;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
  readonly discountCents: number;
  readonly shippingAddress: string;
}
