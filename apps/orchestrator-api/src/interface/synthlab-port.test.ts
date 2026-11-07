import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryPersonaCatalog } from '../infrastructure/personas/in-memory-persona-catalog.js';
import { InMemorySessionQueue } from '../infrastructure/queue/in-memory-session-queue.js';
import { InMemorySandbox } from '../infrastructure/sandbox/in-memory-sandbox.js';
import { createApp } from './create-app.js';
import { InProcessSynthLab } from '../test-support/in-process-synthlab.js';
import { inMemoryAdapters } from '../test-support/in-memory-adapters.js';
import { samplePersona } from '../test-support/persona-catalog-contract.js';
import { ScriptedGateway } from '../test-support/scripted-gateway.js';
import { describeSynthLabContract } from '../test-support/synthlab-contract.js';
import { HttpSynthLab } from '../infrastructure/run/http-synthlab.js';

const personas = () =>
  new InMemoryPersonaCatalog([
    samplePersona('probe'),
    samplePersona('competent-baseline', {
      modelRole: 'competent-baseline',
      biases: [],
      digitalLiteracy: 5,
    }),
  ]);
const gateway = () =>
  new ScriptedGateway([{ tool: 'done', input: { outcome: 'success', reason: 'Hecho.' } }]);

describeSynthLabContract('InProcessSynthLab', () =>
  Promise.resolve({
    synthlab: new InProcessSynthLab({
      store: new InMemoryEventStore(),
      sandbox: new InMemorySandbox(),
      gateway: gateway(),
      personas: personas(),
    }),
  }),
);

describeSynthLabContract('HttpSynthLab', async () => {
  const adapters = {
    ...inMemoryAdapters(),
    queue: new InMemorySessionQueue({ autoRun: true, concurrency: 1 }),
    gateway: gateway(),
    personas: personas(),
  };
  const app = await createApp(adapters, { logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  return {
    synthlab: new HttpSynthLab(adapters.eventStore, await app.getUrl()),
    close: () => app.close(),
  };
});
