import { describeSandboxContract } from '../../test-support/sandbox-contract.js';
import { InMemorySandbox } from './in-memory-sandbox.js';

describeSandboxContract('InMemorySandbox', {
  sandbox: () => new InMemorySandbox(),
  variant: (id) => ({ id, target: 'shoplab', ref: 'main' }),
});
