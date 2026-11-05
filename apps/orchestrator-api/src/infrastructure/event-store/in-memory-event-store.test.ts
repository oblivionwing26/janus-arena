import { describeEventStoreContract } from '../../test-support/event-store-contract.js';
import { InMemoryEventStore } from './in-memory-event-store.js';

describeEventStoreContract('InMemoryEventStore', {
  create: () => Promise.resolve(new InMemoryEventStore()),
});
