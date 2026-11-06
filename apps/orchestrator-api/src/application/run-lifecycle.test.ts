import { isKnownEvent, type JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { BrowserPort, BrowserSessionOptions } from '../domain/browser/browser-port.js';
import { RunNotFoundError } from '../domain/run/run-errors.js';
import { variantIdFor } from '../domain/run/variant-id-for.js';
import { SandboxNotFoundError } from '../domain/sandbox/sandbox-errors.js';
import type { RunningVariant } from '../domain/sandbox/sandbox-port.js';
import type { VariantSpec } from '../domain/sandbox/variant-spec.js';
import { ScriptedBrowser, type ScriptedPage } from '../infrastructure/browser/scripted-browser.js';
import { InMemoryEventStore } from '../infrastructure/event-store/in-memory-event-store.js';
import { InMemorySessionQueue } from '../infrastructure/queue/in-memory-session-queue.js';
import { InMemorySandbox } from '../infrastructure/sandbox/in-memory-sandbox.js';
import { SHOPLAB_PAGES } from '../test-support/shoplab-pages.js';
import { FinishRun } from './finish-run.js';
import { RunAgentSession } from './run-agent-session.js';
import { RunControl } from './run-control.js';
import { runInputFromSessions, StartRun } from './start-run.js';
import { StopRun } from './stop-run.js';

const base = {
  target: 'shoplab',
  ref: 'main',
  sessions: 2,
  budget: { maxTokens: 100_000, maxEur: 1 },
};
const input = runInputFromSessions(base);
const oneSession = runInputFromSessions({ ...base, sessions: 1 });

class FailingSandbox extends InMemorySandbox {
  override up(): Promise<RunningVariant> {
    return Promise.reject(new Error('image build failed'));
  }
}

// Throws a plain (infrastructure-looking) error on the first `failures` new sessions.
class FlakyBrowser extends ScriptedBrowser {
  constructor(
    pages: Record<string, ScriptedPage>,
    private failures: number,
  ) {
    super(pages);
  }

  override newSession(options: BrowserSessionOptions): Promise<string> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('browser-relay connection refused'));
    }
    return super.newSession(options);
  }
}

function setup(
  options: { sandbox?: InMemorySandbox; browser?: BrowserPort; autoRun?: boolean } = {},
) {
  const store = new InMemoryEventStore();
  const sandbox = options.sandbox ?? new InMemorySandbox();
  const browser = options.browser ?? new ScriptedBrowser(SHOPLAB_PAGES);
  const queue = new InMemorySessionQueue({ autoRun: options.autoRun ?? true });
  const control = new RunControl();
  const runSession = new RunAgentSession({ store, browser, control });
  const finishRun = new FinishRun({ store, sandbox, control });
  void queue.start({
    runSession: (job) => runSession.execute(job),
    finishRun: (plan, results) => finishRun.execute(plan, results),
  });
  const startRun = new StartRun({ store, sandbox, queue, control });
  const stopRun = new StopRun({ store, sandbox, control });
  return { store, sandbox, queue, control, startRun, stopRun };
}

async function knownEvents(store: InMemoryEventStore, runId: string): Promise<JanusEvent[]> {
  const events = await store.readRun(runId);
  return events.filter(isKnownEvent);
}

/** run.completed payloads, without the session counter (checked on its own). */
function completions(events: JanusEvent[]) {
  return events.flatMap((event) => {
    if (event.type !== 'run.completed') return [];
    const { sessions: _sessions, ...rest } = event.payload;
    return [rest];
  });
}

function sessionCounts(events: JanusEvent[]) {
  return events.flatMap((event) =>
    event.type === 'run.completed' ? [event.payload.sessions] : [],
  );
}

describe('run lifecycle', () => {
  it('starts, runs every session and completes with success', async () => {
    const { store, sandbox, queue, startRun } = setup();

    const { runId, launched } = await startRun.execute(input);
    await launched;
    await queue.drain();

    const events = await knownEvents(store, runId);
    expect(events[0]).toMatchObject({
      seq: 0,
      type: 'run.started',
      actor: { agentId: 'orchestrator', role: 'orchestrator' },
      payload: { budget: input.budget },
    });
    expect(events.at(-1)?.type).toBe('run.completed');
    expect(completions(events)).toEqual([{ outcome: 'success' }]);
    const agents = new Set(
      events.filter((e) => e.type === 'agent.step').map((e) => e.actor.agentId),
    );
    expect(agents).toEqual(new Set(['scripted-buyer-a-s0-a1', 'scripted-buyer-a-s1-a1']));
    expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index));
    await expect(sandbox.logs(variantIdFor(runId))).rejects.toBeInstanceOf(SandboxNotFoundError);
  });

  it('completes with error when the sandbox cannot start', async () => {
    const { store, startRun } = setup({ sandbox: new FailingSandbox() });

    const { runId, launched } = await startRun.execute(input);
    await launched;

    const [completed] = completions(await knownEvents(store, runId));
    expect(completed?.outcome).toBe('error');
    expect(completed?.reason).toContain('image build failed');
  });

  it('counts an agent that cannot finish as a failed session, without retrying', async () => {
    const pages = { ...SHOPLAB_PAGES, '/cart': { title: 'ShopLab', elements: [] } };
    const browser = new ScriptedBrowser(pages);
    const { store, queue, startRun } = setup({ browser });

    const { runId, launched } = await startRun.execute(oneSession);
    await launched;
    await queue.drain();

    const events = await knownEvents(store, runId);
    expect(completions(events)).toEqual([
      { outcome: 'error', reason: '0/1 sessions completed; failed: 1' },
    ]);
    // One register attempt only: the failure was friction, not infrastructure.
    expect(
      events.filter((e) => e.type === 'agent.action' && e.payload.action === 'goto'),
    ).toHaveLength(1);
  });

  it('retries infrastructure failures and recovers', async () => {
    const { store, queue, startRun } = setup({ browser: new FlakyBrowser(SHOPLAB_PAGES, 1) });

    const { runId, launched } = await startRun.execute(oneSession);
    await launched;
    await queue.drain();

    const events = await knownEvents(store, runId);
    expect(completions(events)).toEqual([{ outcome: 'success' }]);
    // Each attempt is a session of its own: the failed one never ends, so it counts nowhere.
    const started = events.filter((e) => e.type === 'session.started');
    expect(started.map((e) => [e.actor.agentId, e.payload.attempt])).toEqual([
      ['scripted-buyer-a-s0-a1', 1],
      ['scripted-buyer-a-s0-a2', 2],
    ]);
    expect(sessionCounts(events)).toEqual([
      { total: 1, completed: 1, failed: 0, budgetExhausted: 0, cancelled: 0, excluded: 0 },
    ]);
  });

  it('reports persistent infrastructure failures as infra_error, not friction', async () => {
    const { store, queue, startRun } = setup({ browser: new FlakyBrowser(SHOPLAB_PAGES, 99) });

    const { runId, launched } = await startRun.execute(oneSession);
    await launched;
    await queue.drain();

    const events = await knownEvents(store, runId);
    expect(completions(events)).toEqual([
      { outcome: 'error', reason: '0/1 sessions completed; infra_error: 1' },
    ]);
    expect(events.filter((e) => e.type.startsWith('agent.'))).toEqual([]);
    expect(sessionCounts(events)).toEqual([
      { total: 1, completed: 0, failed: 0, budgetExhausted: 0, cancelled: 0, excluded: 1 },
    ]);
  });

  it('completes with budget_exhausted when the shared budget runs out', async () => {
    const { store, queue, control, startRun } = setup({ autoRun: false });

    const { runId, launched } = await startRun.execute(input);
    await launched;
    control.budget(runId)?.charge({
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      estimatedEur: 0,
    });
    await queue.drain();

    expect(completions(await knownEvents(store, runId))[0]?.outcome).toBe('budget_exhausted');
  });

  it('stops a run: tears the sandbox down, records one run.completed, cancels sessions', async () => {
    const { store, sandbox, queue, startRun, stopRun } = setup({ autoRun: false });
    const { runId, launched } = await startRun.execute(input);
    await launched;

    await stopRun.execute(runId);
    await queue.drain();

    const events = await knownEvents(store, runId);
    expect(completions(events)).toEqual([{ outcome: 'error', reason: 'stopped by user' }]);
    expect(events.filter((e) => e.type.startsWith('agent.'))).toEqual([]);
    await expect(sandbox.logs(variantIdFor(runId))).rejects.toBeInstanceOf(SandboxNotFoundError);
  });

  it('stopping twice is a no-op and stopping an unknown run fails', async () => {
    const { store, queue, startRun, stopRun } = setup({ autoRun: false });
    const { runId, launched } = await startRun.execute(input);
    await launched;

    await stopRun.execute(runId);
    await stopRun.execute(runId);
    await queue.drain();

    expect(completions(await knownEvents(store, runId))).toHaveLength(1);
    await expect(stopRun.execute('01JC0F10NOPE0000000000000Z')).rejects.toBeInstanceOf(
      RunNotFoundError,
    );
  });

  it('tears down a variant that finished starting after the run was stopped', async () => {
    let release: (() => void) | undefined;
    class SlowSandbox extends InMemorySandbox {
      override async up(variant: VariantSpec): Promise<RunningVariant> {
        await new Promise<void>((resolve) => (release = resolve));
        return super.up(variant);
      }
    }
    const sandbox = new SlowSandbox();
    const { startRun, stopRun } = setup({ sandbox });

    const { runId, launched } = await startRun.execute(input);
    await stopRun.execute(runId);
    release?.();
    await launched;

    await expect(sandbox.logs(variantIdFor(runId))).rejects.toBeInstanceOf(SandboxNotFoundError);
  });
});
