import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import type { FinishRun } from '../application/finish-run.js';
import type { RunAgentSession } from '../application/run-agent-session.js';
import { APP_ADAPTERS, type AppAdapters } from './app-adapters.js';
import { FINISH_RUN, RUN_AGENT_SESSION } from './tokens.js';

/**
 * Starts the agent-sessions worker in this process when the app boots, and closes the queue,
 * the browser connection and the event store on shutdown.
 */
@Injectable()
export class RunWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(APP_ADAPTERS) private readonly adapters: AppAdapters,
    @Inject(RUN_AGENT_SESSION) private readonly runSession: RunAgentSession,
    @Inject(FINISH_RUN) private readonly finishRun: FinishRun,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.adapters.queue.start({
      runSession: (job) => this.runSession.execute(job),
      finishRun: (plan, results) => this.finishRun.execute(plan, results),
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.adapters.queue.close();
    await this.adapters.browser.shutdown?.();
    await this.adapters.eventStore.close?.();
  }
}
