/** An order as the target reports it to the shopper who placed it. */
export interface OrderRecord {
  /** The shop's own id: a number in ShopLab, a string in Juice Shop. */
  readonly id: number | string;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
  readonly discountCents: number;
  readonly shippingAddress: string;
}
