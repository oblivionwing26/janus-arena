import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LlmEventObserver } from '../application/llm-event-observer.js';
import { PlaywrightRunner } from '../infrastructure/browser/playwright-runner.js';
import { PostgresEventStore } from '../infrastructure/event-store/postgres-event-store.js';
import { AnthropicGateway } from '../infrastructure/llm/anthropic-gateway.js';
import { SdkAnthropicTransport } from '../infrastructure/llm/anthropic-transport.js';
import { loadModelsConfig, repoModelsConfigPath } from '../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../infrastructure/llm/recorded-llm-adapter.js';
import { ShopLabOrderReader } from '../infrastructure/orders/shoplab-order-reader.js';
import { YamlPersonaCatalog } from '../infrastructure/personas/yaml-persona-catalog.js';
import { FileArtifactStore } from '../infrastructure/artifacts/file-artifact-store.js';
import {
  loadFrictionConfig,
  repoFrictionConfigPath,
} from '../infrastructure/friction/friction-config.js';
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

const eventStore = await PostgresEventStore.connect(required('DATABASE_URL'));

// Persona sessions need the LLM. Every real call is also recorded (request and response
// bodies only, never credentials) under recordings/live/, which git ignores.
const hasApiKey = (process.env.ANTHROPIC_API_KEY ?? '') !== '';
const gateway = hasApiKey
  ? new AnthropicGateway(
      new RecordedLLMAdapter({
        mode: 'record',
        dir: fileURLToPath(new URL('../../../../recordings/live/', import.meta.url)),
        inner: new SdkAnthropicTransport(),
      }),
      await loadModelsConfig(repoModelsConfigPath()),
      new LlmEventObserver(eventStore),
    )
  : undefined;
if (gateway === undefined) {
  console.warn('ANTHROPIC_API_KEY is not set: runs can only use the scripted buyer.');
}

const browser = new PlaywrightRunner();
const app = await createApp({
  eventStore,
  sandbox: new DockerSandbox({
    docker: new DockerCli(required('DOCKER_HOST')),
    workspacesRoot: workspacesRoot(),
  }),
  browser,
  orders: new ShopLabOrderReader(browser),
  queue: new BullMqSessionQueue({
    redisUrl: required('REDIS_URL'),
    concurrency: Number(process.env.SESSION_CONCURRENCY ?? 2),
  }),
  personas: new YamlPersonaCatalog(),
  artifacts: new FileArtifactStore(),
  friction: await loadFrictionConfig(repoFrictionConfigPath()),
  ...(gateway === undefined ? {} : { gateway }),
});
app.enableShutdownHooks();
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
