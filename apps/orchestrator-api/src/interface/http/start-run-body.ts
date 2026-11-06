import { z } from 'zod';

import type { RunConfig } from '../../domain/run/run-config.js';

const target = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
const ref = z.string().regex(/^[\w][\w./-]{0,99}$/);
const personaId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);
const budget = z.object({
  maxTokens: z.int().positive().max(10_000_000),
  maxEur: z.number().positive().max(100),
});

/** The single-variant body of F0.10/F1.4: scripted buyers, or personas played in turn. */
export const sessionsBodySchema = z.strictObject({
  target,
  ref,
  sessions: z.int().min(1).max(5),
  budget,
  /** Personas played in turn by the sessions (F1.4). Omitted: the scripted buyer. */
  personas: z.array(personaId).min(1).max(20).optional(),
});

/**
 * A run file (runs/*.yaml, F1.7), sent as is by `pnpm run:start`. The domain checks the rest
 * (unique keys, the baseline not listed, at most 100 sessions).
 */
export const runConfigBodySchema = z.strictObject({
  target,
  variants: z
    .array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9]{0,3}$/), ref }))
    .min(1)
    .max(4),
  /** Empty for a baseline-only run (F1.9). */
  personas: z.array(personaId).max(10),
  /** Tasks every slot plays, checked by the oracle (F1.9). */
  tasks: z
    .array(
      z.strictObject({
        id: personaId,
        goal: z.string().min(1).max(300),
        expect: z.strictObject({
          items: z
            .array(
              z.strictObject({
                product: z.string().min(1).max(100),
                quantity: z.int().min(1).max(10),
              }),
            )
            .min(1)
            .max(10),
          discounted: z.boolean().optional(),
          shippingAddress: z.string().min(1).max(200).optional(),
        }),
      }),
    )
    .max(10)
    .optional(),
  seeds: z.array(z.int().min(0).max(9999)).min(1).max(20),
  maxSteps: z.int().min(1).max(200).optional(),
  budget,
  concurrency: z.int().min(1).max(10).optional(),
});

/** Body of POST /runs: a run config when it has `variants`, the single-variant body otherwise. */
export const startRunBodySchema = z.union([runConfigBodySchema, sessionsBodySchema]);

export type RunConfigBody = z.infer<typeof runConfigBodySchema>;

export function runConfigFromBody(body: RunConfigBody): RunConfig {
  return {
    target: body.target,
    variants: body.variants.map(({ id, ref: variantRef }) => ({ key: id, ref: variantRef })),
    personas: body.personas,
    seeds: body.seeds,
    budget: body.budget,
    ...(body.maxSteps === undefined ? {} : { maxSteps: body.maxSteps }),
    ...(body.concurrency === undefined ? {} : { concurrency: body.concurrency }),
    ...(body.tasks === undefined
      ? {}
      : {
          tasks: body.tasks.map((task) => ({
            id: task.id,
            goal: task.goal,
            expect: {
              items: task.expect.items,
              ...(task.expect.discounted === undefined
                ? {}
                : { discounted: task.expect.discounted }),
              ...(task.expect.shippingAddress === undefined
                ? {}
                : { shippingAddress: task.expect.shippingAddress }),
            },
          })),
        }),
  };
}
