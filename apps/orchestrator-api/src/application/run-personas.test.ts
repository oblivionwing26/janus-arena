// A run whose sessions play personas (F1.4), end to end with in-memory adapters and a
// scripted LLM: start, persona session, finish.

import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { PersonaNotFoundError } from '../domain/persona/persona-not-found-error.js';
import { ScriptedBrowser } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemoryPersonaCatalog } from '../infrastructure/personas/in-memory-persona-catalog.js';
import { InMemorySessionQueue } from '../infrastructure/queue/in-memory-session-queue.js';
import { InMemorySandbox } from '../infrastructure/sandbox/in-memory-sandbox.js';
import { samplePersona } from '../test-support/persona-catalog-contract.js';
import { ScriptedGateway } from '../test-support/scripted-gateway.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { FinishRun } from './finish-run.js';
import { RunAgentSession } from './run-agent-session.js';
import { RunControl } from './run-control.js';
import { StartRun } from './start-run.js';

const input = {
  target: 'shoplab',
  ref: 'main',
  sessions: 1,
  budget: { maxTokens: 1_000_000, maxEur: 1 },
  personas: ['ana-careful'],
};

function setup() {
  const store = new InMemoryEventStore();
  const sandbox = new InMemorySandbox();
  const queue = new InMemorySessionQueue({ autoRun: true });
  const control = new RunControl();
  const personas = new InMemoryPersonaCatalog([samplePersona('ana-careful')]);
  // Refs of the fake pages from the home page on: the mug, quantity, add, pay, confirm.
  const gateway = new ScriptedGateway([
    { tool: 'click', input: { ref: 'e1' } },
    { tool: 'click', input: { ref: 'e3' } },
    { tool: 'click', input: { ref: 'e4' } },
    { tool: 'click', input: { ref: 'e5' } },
    { tool: 'done', input: { outcome: 'success', reason: 'Ya está.' } },
  ]);
  const runSession = new RunAgentSession({
    store,
    browser: new ScriptedBrowser(SHOPLAB_PAGES),
    control,
    navigator: { gateway, personas },
  });
  const finishRun = new FinishRun({ store, sandbox, control });
  void queue.start({
    runSession: (job) => runSession.execute(job),
    finishRun: (plan, results) => finishRun.execute(plan, results),
  });
  return { store, queue, startRun: new StartRun({ store, sandbox, queue, control, personas }) };
}

describe('runs with personas', () => {
  it('plays the persona with the navigator and completes the run', async () => {
    const { store, queue, startRun } = setup();

    const { runId, launched } = await startRun.execute(input);
    await launched;
    await queue.drain();

    const events = (await store.readRun(runId)).filter(isKnownEvent);
    const ended = events.find((event) => event.type === 'session.ended');
    expect(ended?.actor).toEqual({ agentId: 'ana-careful-0', role: 'navigator' });
    expect(ended?.payload).toMatchObject({ outcome: 'success', steps: 5 });
    expect(events.at(-1)).toMatchObject({ type: 'run.completed', payload: { outcome: 'success' } });
  });

  it('rejects an unknown persona before the run exists', async () => {
    const { store, startRun } = setup();

    await expect(startRun.execute({ ...input, personas: ['nobody'] })).rejects.toBeInstanceOf(
      PersonaNotFoundError,
    );
    expect(await store.listRuns()).toEqual([]);
  });
});
