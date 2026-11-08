import { describeBrowserAttackContract } from '../../test-support/browser-attack-contract.js';
import { InMemoryBrowserAttack } from './in-memory-browser-attack.js';

const ORIGIN = 'http://janus-shop-app:3000';

describeBrowserAttackContract('InMemoryBrowserAttack', {
  create: () => ({
    origin: ORIGIN,
    port: new InMemoryBrowserAttack(ORIGIN, [
      { template: `${ORIGIN}/#/search?q={payload}`, field: 'search', unsafe: true },
    ]),
  }),
});
