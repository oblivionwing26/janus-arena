import { InfrastructureError } from '../../domain/run/run-errors.js';
import type { ShopperAccount, ShopperAccountPort } from '../../domain/task/shopper-account-port.js';

/** Accounts kept in memory, for tests; an email can be taken only once, as in a real shop. */
export class InMemoryShopperAccounts implements ShopperAccountPort {
  readonly created: ShopperAccount[] = [];

  create(_baseUrl: string, account: ShopperAccount): Promise<void> {
    if (this.created.some((each) => each.email === account.email)) {
      return Promise.reject(new InfrastructureError(`${account.email} is already registered`));
    }
    this.created.push(account);
    return Promise.resolve();
  }
}
