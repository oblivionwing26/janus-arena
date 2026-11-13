import { describePullRequestContract } from '../../test-support/pull-request-contract.js';
import { InMemoryPullRequests } from './in-memory-pull-requests.js';

const workspace = {
  id: '01JC0F2NB7E0000000000000WS',
  path: 'memory://ws',
  url: 'file:///memory/ws',
  baseSha: 'a'.repeat(40),
};

describePullRequestContract('InMemoryPullRequests', {
  create: () => ({ port: new InMemoryPullRequests(), workspace }),
});
