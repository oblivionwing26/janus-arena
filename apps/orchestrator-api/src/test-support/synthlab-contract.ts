// Shared contract suite for SynthLabPort: the in-process adapter and HttpSynthLab (against the
// app on a local port, in-memory adapters behind it) both run it in `pnpm test`.
// Not part of the build.

import { isKnownEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { RunConfig } from '../domain/run/run-config.js';
import type { SynthLabPort } from '../domain/run/synthlab-port.js';

const CONFIG: RunConfig = {
  target: 'shoplab',
  variants: [
    { key: 'a', ref: 'main' },
    {
      key: 'b',
      ref: 'janus/variant-01JC0F24SYN0000000000000AA',
      repo: 'file:///work/01JC0F24SYN0000000000000AA',
    },
  ],
  personas: ['probe'],
  seeds: [1],
  budget: { maxTokens: 1_000_000, maxEur: 1 },
};

export function describeSynthLabContract(
  name: string,
  create: () => Promise<{ synthlab: SynthLabPort; close?: () => Promise<void> }>,
): void {
  describe(`SynthLabPort contract: ${name}`, () => {
    it('names the run as soon as it starts, and waits for it again later (F3.9)', async () => {
      const { synthlab, close } = await create();
      try {
        const heard: string[] = [];
        const run = await synthlab.runAndWait(CONFIG, {
          onStarted: (runId) => {
            heard.push(runId);
            return Promise.resolve();
          },
        });
        expect(heard).toEqual([run.runId]);

        const again = await synthlab.waitFor(run.runId);
        expect(again.runId).toBe(run.runId);
        expect(again.events.map((event) => event.id)).toEqual(run.events.map((event) => event.id));
      } finally {
        await close?.();
      }
    });

    it('plays the whole run and returns it once completed', async () => {
      const { synthlab, close } = await create();
      try {
        const { runId, events } = await synthlab.runAndWait(CONFIG);
        const known = events.filter(isKnownEvent);

        expect(runId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(known[0]?.type).toBe('run.started');
        expect(known.at(-1)?.type).toBe('run.completed');
        const slots = known.flatMap((event) =>
          event.type === 'session.started'
            ? [`${event.payload.variant}:${event.payload.kind}`]
            : [],
        );
        expect(slots.sort()).toEqual(['a:baseline', 'a:persona', 'b:baseline', 'b:persona']);
      } finally {
        await close?.();
      }
    });
  });
}
