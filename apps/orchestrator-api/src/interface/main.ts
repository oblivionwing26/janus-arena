import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PlaywrightRunner } from '../infrastructure/browser/playwright-runner.js';
import { PostgresEventStore } from '../infrastructure/event-store/postgres-event-store.js';
import { BullMqSessionQueue } from '../infrastructure/queue/bullmq-session-queue.js';
import { DockerCli } from '../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from '../infrastructure/sandbox/workspace.js';
import { createApp } from './create-app.js';

// Local runs read the repository .env; variables already set in the environment win.
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

const app = await createApp({
  eventStore: await PostgresEventStore.connect(required('DATABASE_URL')),
  sandbox: new DockerSandbox({
    docker: new DockerCli(required('DOCKER_HOST')),
    workspacesRoot: workspacesRoot(),
  }),
  browser: new PlaywrightRunner(),
  queue: new BullMqSessionQueue({
    redisUrl: required('REDIS_URL'),
    concurrency: Number(process.env.SESSION_CONCURRENCY ?? 2),
  }),
});
app.enableShutdownHooks();
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
