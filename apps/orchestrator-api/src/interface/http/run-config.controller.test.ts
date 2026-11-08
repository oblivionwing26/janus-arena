// POST /runs with a run file (F1.7), and the example in runs/ab-demo.yaml.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { runInputFromConfig } from '../../application/start-run.js';
import { InMemoryPersonaCatalog } from '../../infrastructure/personas/in-memory-persona-catalog.js';
import { inMemoryAdapters } from '../../test-support/in-memory-adapters.js';
import { samplePersona } from '../../test-support/persona-catalog-contract.js';
import { createApp } from '../create-app.js';
import { runConfigBodySchema, runConfigFromBody } from './start-run-body.js';

const exampleFile = fileURLToPath(new URL('../../../../../runs/ab-demo.yaml', import.meta.url));

const config = {
  target: 'shoplab',
  variants: [
    { id: 'a', ref: 'main' },
    { id: 'b', ref: 'main' },
  ],
  personas: ['ana-careful'],
  seeds: [1],
  maxSteps: 20,
  budget: { maxTokens: 100_000, maxEur: 0.2 },
  concurrency: 2,
};

describe('runs/ab-demo.yaml', () => {
  it('is a valid run file with the 10 sessions of the F1.7 "Done when"', () => {
    const body = runConfigBodySchema.parse(parse(readFileSync(exampleFile, 'utf8')));
    const input = runInputFromConfig(runConfigFromBody(body));

    expect(input.variants.map((variant) => variant.key)).toEqual(['a', 'b']);
    expect(input.sessions).toHaveLength(10);
    expect(input.budget.maxEur).toBeLessThanOrEqual(0.5);
  });
});

describe('POST /runs with a run config', () => {
  let app: NestFastifyApplication;
  let adapters: ReturnType<typeof inMemoryAdapters>;

  beforeEach(async () => {
    adapters = inMemoryAdapters();
    app = await createApp(
      {
        ...adapters,
        // The baseline is added to every variant, so the catalog must have it.
        personas: new InMemoryPersonaCatalog([
          samplePersona('ana-careful'),
          samplePersona('competent-baseline', {
            modelRole: 'competent-baseline',
            biases: [],
            digitalLiteracy: 5,
          }),
        ]),
      },
      { logger: false },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('starts a paired run on every variant', async () => {
    const response = await app.inject({ method: 'POST', url: '/runs', payload: config });

    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();
    const [started] = await adapters.eventStore.readRun(runId);
    expect(started?.type).toBe('run.started');
    // F2.8: the variants are on the record, so the console can find a generated B.
    expect(started?.payload).toMatchObject({
      variants: config.variants.map(({ id, ref }) => ({ key: id, ref })),
    });
  });

  it.each([
    ['the baseline listed as a persona', { ...config, personas: ['competent-baseline'] }],
    ['an unknown persona', { ...config, personas: ['nobody'] }],
    [
      'repeated variants',
      {
        ...config,
        variants: [
          { id: 'a', ref: 'main' },
          { id: 'a', ref: 'main' },
        ],
      },
    ],
    ['a variant id that is too long', { ...config, variants: [{ id: 'variant', ref: 'main' }] }],
  ])('answers 400 for %s', async (_label, payload) => {
    const response = await app.inject({ method: 'POST', url: '/runs', payload });

    expect(response.statusCode).toBe(400);
  });
});
