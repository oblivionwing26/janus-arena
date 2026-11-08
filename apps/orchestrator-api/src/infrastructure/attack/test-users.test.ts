import { describeTestUserContract } from '../../test-support/test-user-contract.js';
import { InMemoryTestUsers } from './in-memory-test-users.js';

describeTestUserContract('InMemoryTestUsers', { users: () => new InMemoryTestUsers() });
