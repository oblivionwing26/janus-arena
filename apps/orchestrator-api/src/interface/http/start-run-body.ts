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
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9]{0,3}$/),
        ref,
        /** A generated variant in a local clone (F2.4); the sandbox checks where it is. */
        repo: z
          .string()
          .regex(/^file:\/\/\S{1,400}$/)
          .optional(),
        /** A patched image variant's base commit in that clone (F3.5). */
        base: z
          .string()
          .regex(/^[0-9a-f]{40}$/)
          .optional(),
        /** Settings the variant runs with, e.g. which defenses are on (F4.1). */
        env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), z.string().max(200)).optional(),
      }),
    )
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
  /** Launch Day (F4.1): saboteurs that load every variant while the personas shop. */
  saboteurs: z
    .strictObject({ count: z.int().min(1).max(5), requestsPerSecond: z.int().min(1).max(20) })
    .optional(),
  clientIps: z
    .discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('distinct') }),
      z.strictObject({ mode: z.literal('shared'), addresses: z.int().min(1).max(50) }),
    ])
    .optional(),
});

/** Body of POST /runs: a run config when it has `variants`, the single-variant body otherwise. */
export const startRunBodySchema = z.union([runConfigBodySchema, sessionsBodySchema]);

export type RunConfigBody = z.infer<typeof runConfigBodySchema>;

export function runConfigFromBody(body: RunConfigBody): RunConfig {
  return {
    target: body.target,
    variants: body.variants.map(({ id, ref: variantRef, repo, base, env }) => ({
      key: id,
      ref: variantRef,
      ...(repo === undefined ? {} : { repo }),
      ...(base === undefined ? {} : { base }),
      ...(env === undefined ? {} : { env }),
    })),
    personas: body.personas,
    seeds: body.seeds,
    budget: body.budget,
    ...(body.maxSteps === undefined ? {} : { maxSteps: body.maxSteps }),
    ...(body.concurrency === undefined ? {} : { concurrency: body.concurrency }),
    ...(body.saboteurs === undefined ? {} : { saboteurs: body.saboteurs }),
    ...(body.clientIps === undefined ? {} : { clientIps: body.clientIps }),
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
