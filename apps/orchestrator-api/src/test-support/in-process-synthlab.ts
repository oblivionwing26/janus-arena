// SynthLabPort in the test process (F2.4): the real StartRun, queue and FinishRun over
// in-memory adapters, a scripted browser and a scripted model. Not part of the build.

import { FinishRun } from '../application/finish-run.js';
import { RunAgentSession } from '../application/run-agent-session.js';
import { RunControl } from '../application/run-control.js';
import { runInputFromConfig, StartRun } from '../application/start-run.js';
import type { EventStorePort } from '../domain/event-store/event-store-port.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { PersonaCatalogPort } from '../domain/persona/persona-catalog-port.js';
import type { RunConfig } from '../domain/run/run-config.js';
import type { CompletedRun, SynthLabPort } from '../domain/run/synthlab-port.js';
import type { SandboxPort } from '../domain/sandbox/sandbox-port.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryOrderReader } from '../infrastructure/orders/in-memory-order-reader.js';
import { InMemorySessionQueue } from '../infrastructure/queue/in-memory-session-queue.js';
import { SHOPLAB_PAGES } from './shoplab-pages.js';

export class InProcessSynthLab implements SynthLabPort {
  readonly configs: RunConfig[] = [];

  constructor(
    private readonly deps: {
      readonly store: EventStorePort;
      readonly sandbox: SandboxPort;
      readonly gateway: LLMGatewayPort;
      readonly personas: PersonaCatalogPort;
    },
  ) {}

  async runAndWait(config: RunConfig): Promise<CompletedRun> {
    this.configs.push(config);
    const { store, sandbox, gateway, personas } = this.deps;
    const queue = new InMemorySessionQueue({ autoRun: true, concurrency: 1 });
    const control = new RunControl();
    const runSession = new RunAgentSession({
      store,
      browser: new ScriptedBrowser(SHOPLAB_PAGES),
      control,
      navigator: { gateway, personas },
      orders: new InMemoryOrderReader(),
    });
    const finishRun = new FinishRun({ store, sandbox, control });
    void queue.start({
      runSession: (job) => runSession.execute(job),
      finishRun: (plan, results) => finishRun.execute(plan, results),
    });
    const { runId, launched } = await new StartRun({
      store,
      sandbox,
      queue,
      control,
      personas,
    }).execute(runInputFromConfig(config));
    await launched;
    await queue.drain();
    return { runId, events: await store.readRun(runId) };
  }
}
