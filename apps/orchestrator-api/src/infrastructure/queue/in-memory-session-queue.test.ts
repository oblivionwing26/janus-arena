import { describeSessionQueueContract } from '../../test-support/session-queue-contract.js';
import { InMemorySessionQueue } from './in-memory-session-queue.js';

describeSessionQueueContract('InMemorySessionQueue', {
  create: () => new InMemorySessionQueue({ concurrency: 2, maxAttempts: 3 }),
});
