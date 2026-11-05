import { Module, type DynamicModule } from '@nestjs/common';

import { FinishRun } from '../application/finish-run.js';
import { RunAgentSession } from '../application/run-agent-session.js';
import { RunControl } from '../application/run-control.js';
import { StartRun } from '../application/start-run.js';
import { StopRun } from '../application/stop-run.js';
import { BROWSER_PORT } from '../domain/browser/browser-port.js';
import { EVENT_STORE_PORT } from '../domain/event-store/event-store-port.js';
import { SESSION_QUEUE_PORT } from '../domain/run/session-queue-port.js';
import { SANDBOX_PORT } from '../domain/sandbox/sandbox-port.js';
import { APP_ADAPTERS, type AppAdapters } from './app-adapters.js';
import { HealthController } from './http/health.controller.js';
import { RunsController } from './http/runs.controller.js';
import { RunWorker } from './run-worker.js';
import { FINISH_RUN, RUN_AGENT_SESSION, RUN_CONTROL, START_RUN, STOP_RUN } from './tokens.js';

// Composition root (ADR 0001): the only place that wires adapters to ports.
// Everything is injected with explicit tokens (@Inject(TOKEN)), never by constructor type.
@Module({})
export class AppModule {
  static register(adapters: AppAdapters): DynamicModule {
    const { eventStore: store, sandbox, browser, queue } = adapters;
    const control = new RunControl();
    return {
      module: AppModule,
      controllers: [HealthController, RunsController],
      providers: [
        { provide: APP_ADAPTERS, useValue: adapters },
        { provide: EVENT_STORE_PORT, useValue: store },
        { provide: SANDBOX_PORT, useValue: sandbox },
        { provide: BROWSER_PORT, useValue: browser },
        { provide: SESSION_QUEUE_PORT, useValue: queue },
        { provide: RUN_CONTROL, useValue: control },
        { provide: START_RUN, useValue: new StartRun({ store, sandbox, queue, control }) },
        { provide: STOP_RUN, useValue: new StopRun({ store, sandbox, control }) },
        { provide: RUN_AGENT_SESSION, useValue: new RunAgentSession({ store, browser, control }) },
        { provide: FINISH_RUN, useValue: new FinishRun({ store, sandbox, control }) },
        RunWorker,
      ],
    };
  }
}
