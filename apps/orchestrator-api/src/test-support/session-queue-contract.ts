// Shared contract suite for SessionQueuePort runtimes: InMemorySessionQueue in `pnpm test`,
// BullMqSessionQueue against Redis in `pnpm test:integration`. Not part of the build.

import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { InfrastructureError } from '../domain/run/run-errors.js';
import type { RunPlan, SessionJob, SessionResult } from '../domain/run/session-queue-port.js';
import type { SessionQueueRuntime } from '../infrastructure/queue/session-queue-runtime.js';
import { testUlid } from './event-store-contract.js';

export interface SessionQueueContractHarness {
  /** A runtime with concurrency 2 and 3 attempts per session. */
  readonly create: () => SessionQueueRuntime;
}

interface Finished {
  readonly plan: RunPlan;
  readonly results: readonly SessionResult[];
}

function plan(sessions: number): RunPlan {
  return {
    runId: testUlid(),
    variantId: 'r-contract',
    baseUrl: 'http://janus-x-app:3100',
    sessions,
  };
}

export function describeSessionQueueContract(
  name: string,
  harness: SessionQueueContractHarness,
): void {
  describe(`SessionQueuePort contract: ${name}`, () => {
    let runtime: SessionQueueRuntime | undefined;

    afterEach(async () => {
      await runtime?.close();
      runtime = undefined;
    });

    async function run(
      sessions: number,
      runSession: (job: SessionJob) => Promise<SessionResult>,
    ): Promise<Finished[]> {
      const finished: Finished[] = [];
      runtime = harness.create();
      await runtime.start({
        runSession,
        finishRun: (finishedPlan, results) => {
          finished.push({ plan: finishedPlan, results });
          return Promise.resolve();
        },
      });
      const thePlan = plan(sessions);
      await runtime.enqueueRun(thePlan);
      const deadline = Date.now() + 20_000;
      while (finished.length === 0 && Date.now() < deadline) await sleep(50);
      await sleep(200); // a second finishRun would show up here
      return finished;
    }

    it('runs every session, then finishes the run once with every result', async () => {
      const finished = await run(3, (job) =>
        Promise.resolve({ sessionIndex: job.sessionIndex, status: 'completed' }),
      );

      expect(finished).toHaveLength(1);
      expect(finished[0]?.results.map((result) => result.sessionIndex)).toEqual([0, 1, 2]);
      expect(finished[0]?.results.every((result) => result.status === 'completed')).toBe(true);
    }, 30_000);

    it('retries infrastructure failures with increasing attempt numbers', async () => {
      const attempts: number[] = [];
      const finished = await run(1, (job) => {
        attempts.push(job.attempt);
        return job.attempt < 2
          ? Promise.reject(new InfrastructureError('browser-relay refused'))
          : Promise.resolve({ sessionIndex: job.sessionIndex, status: 'completed' });
      });

      expect(attempts).toEqual([1, 2]);
      expect(finished[0]?.results).toEqual([{ sessionIndex: 0, status: 'completed' }]);
    }, 30_000);

    it('gives up after 3 attempts and reports infra_error', async () => {
      let calls = 0;
      const finished = await run(1, () => {
        calls += 1;
        return Promise.reject(new InfrastructureError('sandbox gone'));
      });

      expect(calls).toBe(3);
      expect(finished[0]?.results).toEqual([
        { sessionIndex: 0, status: 'infra_error', detail: 'sandbox gone' },
      ]);
    }, 30_000);

    it('runs at most 2 sessions at a time', async () => {
      let active = 0;
      let peak = 0;
      await run(4, async (job) => {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(100);
        active -= 1;
        return { sessionIndex: job.sessionIndex, status: 'completed' };
      });

      expect(peak).toBe(2);
    }, 30_000);
  });
}
