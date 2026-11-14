import { describe, expect, it } from 'vitest';

import { InfrastructureError } from '../domain/run/run-errors.js';
import type { SessionJob } from '../domain/run/session-queue-port.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { RunAgentSession } from './run-agent-session.js';
import { RunControl } from './run-control.js';
import type { RunSaboteur } from './saboteur/run-saboteur.js';

const RUN_ID = '01JC0F28CNS0000000000000AA';
const job: SessionJob = {
  runId: RUN_ID,
  target: 'shoplab',
  attempt: 1,
  variant: { key: 'a', variantId: 'v-a', baseUrl: 'http://shoplab:3000' },
  spec: { sessionIndex: 0, variant: 'a', kind: 'saboteur', seed: 0, clientIp: '10.99.0.1' },
};

function session(saboteur?: Pick<RunSaboteur, 'execute'>) {
  const control = new RunControl();
  control.register(RUN_ID, { maxTokens: 1000, maxEur: 1 });
  return new RunAgentSession({
    store: new InMemoryEventStore(),
    browser: new ScriptedBrowser(SHOPLAB_PAGES),
    control,
    ...(saboteur === undefined ? {} : { saboteur }),
  });
}

describe('a saboteur slot (F4.1)', () => {
  it('is played by the saboteur, with the run signal, and not by a browser', async () => {
    const seen: SessionJob[] = [];

    const result = await session({
      execute: (each) => {
        seen.push(each);
        return Promise.resolve({ sessionIndex: each.spec.sessionIndex, status: 'completed' });
      },
    }).execute(job);

    expect(result).toEqual({ sessionIndex: 0, status: 'completed' });
    expect(seen).toEqual([job]);
  });

  it('is a platform failure, to retry, in a process that has no saboteurs', async () => {
    await expect(session().execute(job)).rejects.toThrow(InfrastructureError);
  });
});
