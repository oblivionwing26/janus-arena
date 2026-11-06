/**
 * A task a session plays (F1.9): what the agent is asked to do, and what must be true in the
 * target afterwards. The expectation is checked by code (the oracle), never by the agent.
 */
export interface TaskSpec {
  /** Slug, e.g. `buy-two-notebooks`. */
  readonly id: string;
  /** What the agent reads as its goal, in place of the persona's own goal. */
  readonly goal: string;
  readonly expect: TaskExpectation;
}

export interface TaskExpectation {
  /** Products (by name, as the shop shows them) and quantities that one order must contain. */
  readonly items: readonly { readonly product: string; readonly quantity: number }[];
  /** The order must carry a discount (a coupon was applied). */
  readonly discounted?: boolean;
  /** The order must be shipped to exactly this address. */
  readonly shippingAddress?: string;
}
