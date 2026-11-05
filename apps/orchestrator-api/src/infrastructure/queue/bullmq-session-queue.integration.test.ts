import { randomUUID } from 'node:crypto';

import { describeSessionQueueContract } from '../../test-support/session-queue-contract.js';
import { BullMqSessionQueue } from './bullmq-session-queue.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';

describeSessionQueueContract('BullMqSessionQueue (Redis)', {
  create: () =>
    new BullMqSessionQueue({
      redisUrl,
      concurrency: 2,
      maxAttempts: 3,
      backoffMs: 50,
      // A fresh prefix per runtime, so tests never pick up each other's or real jobs.
      prefix: `janus-test-${randomUUID().slice(0, 8)}`,
    }),
});
