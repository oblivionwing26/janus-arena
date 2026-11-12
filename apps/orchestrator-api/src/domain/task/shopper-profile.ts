/**
 * The synthetic details a persona uses on one target (F3.5a, config/shoppers.yaml): the domain
 * of its account emails, and what it types when the target's forms ask (address, phone, test
 * card...). Never real personal data.
 */
export interface ShopperProfile {
  readonly emailDomain: string;
  readonly details: Readonly<Record<string, string>>;
  /**
   * `preregistered`: the orchestrator creates the account before the session and the persona
   * is told it has one, for shops where buying needs an account they never ask for (Juice Shop).
   * The persona still signs in itself. Otherwise the persona creates it if it needs one.
   */
  readonly account?: 'self-registers' | 'preregistered' | undefined;
  /**
   * Only with `preregistered`: the account also holds the home address and card, as a returning
   * customer's does, so the session measures finding and paying rather than filling in two long
   * forms that outlast every persona's patience (Juice Shop, F3.5a).
   */
  readonly savedCheckout?: boolean | undefined;
}

/** ShopLab's details since F1.9: the default, so runs queued before F3.5a play as before. */
export const SHOPLAB_SHOPPER: ShopperProfile = {
  emailDomain: 'shoplab.test',
  details: { address: 'Calle Sintética 1, 28001 Madrid' },
};
