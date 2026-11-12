/** The account a shopper slot uses: its synthetic details, as the persona will type them. */
export interface ShopperAccount {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly details: Readonly<Record<string, string>>;
  /** Also save the home address and card from `details` in the account (F3.5a). */
  readonly saveCheckout?: boolean | undefined;
}

/**
 * Creates a shopper's account on a target before its session starts (F3.5a), for targets where
 * buying needs an account the shop never asks for (Juice Shop: an anonymous basket silently
 * stays empty). The persona then signs in itself, so signing in stays part of what is measured.
 * Throws InfrastructureError when the target refuses. Every adapter must pass
 * src/test-support/shopper-account-contract.ts.
 */
export interface ShopperAccountPort {
  create(baseUrl: string, account: ShopperAccount): Promise<void>;
}
