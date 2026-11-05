import { setTimeout as sleep } from 'node:timers/promises';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemorySessionQueue } from '../../infrastructure/queue/in-memory-session-queue.js';
import { variantIdFor } from '../../domain/run/variant-id-for.js';
import { SandboxNotFoundError } from '../../domain/sandbox/sandbox-errors.js';
import { inMemoryAdapters } from '../../test-support/in-memory-adapters.js';
import { createApp } from '../create-app.js';

const body = {
  target: 'shoplab',
  ref: 'main',
  sessions: 2,
  budget: { maxTokens: 1000, maxEur: 1 },
};

interface SseEvent {
  event: string;
  data: { seq: number; type: string; payload: Record<string, unknown> };
}

// Parses a text/event-stream body into its events.
function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const lines = block.split('\n');
      const event =
        lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim() ?? '';
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      return { event, data: JSON.parse(data) as SseEvent['data'] };
    });
}

describe('runs API', () => {
  let app: NestFastifyApplication;
  let adapters: ReturnType<typeof inMemoryAdapters>;

  beforeEach(async () => {
    adapters = inMemoryAdapters();
    app = await createApp(adapters, { logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  async function startRun(): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/runs', payload: body });
    expect(response.statusCode).toBe(202);
    return response.json<{ runId: string }>().runId;
  }

  async function waitForCompletion(runId: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const { runs } = (await app.inject({ method: 'GET', url: '/runs' })).json<{
        runs: { runId: string; status: string }[];
      }>();
      if (runs.find((run) => run.runId === runId)?.status === 'completed') return;
      await sleep(20);
    }
    throw new Error(`run ${runId} did not complete`);
  }

  it('rejects an invalid run request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { ...body, sessions: 50, ref: '--upload-pack=x' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('runs end to end: POST /runs, GET /runs, replayed events', async () => {
    const runId = await startRun();
    await waitForCompletion(runId);

    const { runs } = (await app.inject({ method: 'GET', url: '/runs' })).json<{
      runs: { runId: string; outcome: string }[];
    }>();
    expect(runs.find((run) => run.runId === runId)?.outcome).toBe('success');

    const replay = await app.inject({ method: 'GET', url: `/runs/${runId}/events?replay=1` });
    expect(replay.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(replay.body);
    expect(events[0]?.event).toBe('run.started');
    expect(events.at(-1)?.event).toBe('run.completed');
    expect(events.filter((event) => event.event === 'agent.step')).toHaveLength(12);
    expect(events.map((event) => event.data.seq)).toEqual(events.map((_, index) => index));
  });

  it('streams a finished run live and closes the stream after run.completed', async () => {
    const runId = await startRun();
    await waitForCompletion(runId);

    const live = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });

    const events = parseSse(live.body);
    expect(events.at(-1)?.event).toBe('run.completed');
  });

  it('stops a run and tears its variant down', async () => {
    await app.close();
    const queue = new InMemorySessionQueue({ autoRun: false });
    adapters = { ...inMemoryAdapters(), queue };
    app = await createApp(adapters, { logger: false });
    const runId = await startRun();
    await sleep(20); // let the variant come up

    const stopped = await app.inject({ method: 'POST', url: `/runs/${runId}/stop` });
    await queue.drain();

    expect(stopped.statusCode).toBe(202);
    const events = parseSse(
      (await app.inject({ method: 'GET', url: `/runs/${runId}/events?replay=1` })).body,
    );
    expect(events.filter((event) => event.event === 'run.completed')).toHaveLength(1);
    expect(events.at(-1)?.data.payload).toEqual({ outcome: 'error', reason: 'stopped by user' });
    await expect(adapters.sandbox.logs(variantIdFor(runId))).rejects.toBeInstanceOf(
      SandboxNotFoundError,
    );
  });

  it('answers 404 for unknown runs and 400 for malformed ids', async () => {
    const unknown = '01JC0F10NXPE0000000000000Z';

    expect((await app.inject({ method: 'POST', url: `/runs/${unknown}/stop` })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url: `/runs/${unknown}/events` })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'POST', url: '/runs/not-a-ulid/stop' })).statusCode).toBe(
      400,
    );
  });
});
