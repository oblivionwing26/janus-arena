import { describeShopperAccountContract } from '../../test-support/shopper-account-contract.js';
import { InMemoryShopperAccounts } from './in-memory-shopper-accounts.js';

describeShopperAccountContract('InMemoryShopperAccounts', {
  create: () => ({ accounts: new InMemoryShopperAccounts(), baseUrl: 'http://janus-a-app:3000' }),
});
