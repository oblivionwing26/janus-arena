import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

/** The gate's stages, in the order they run (F3.9). */
export const GATE_STAGES = [
  'synthlab-a',
  'variant-b',
  'ab',
  'audit',
  'red-team',
  'blue-team',
  'report',
  'pr',
] as const;

export const gateStageNameSchema = z.enum(GATE_STAGES);
export type GateStageName = z.infer<typeof gateStageNameSchema>;

/** What a completed stage hands to the next ones: run ids, branches, paths, counts. */
export const gateStageOutputSchema = z.record(
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/),
  z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(500)).max(50)]),
);
export type GateStageOutput = z.infer<typeof gateStageOutputSchema>;

// One step of a gate stage, in the gate's own run (F3.9): `started` with its share of the
// budget; `run` for each run the stage starts (so a resumed gate can wait for it or close it);
// `completed` with its output and what its runs spent; `skipped` or `failed` with why. A resumed
// gate reads these to skip completed stages and to reuse their output.
export const gateStageEventSchema = defineEventSchema(
  'gate.stage',
  1,
  z
    .object({
      stage: gateStageNameSchema,
      status: z.enum(['started', 'run', 'completed', 'skipped', 'failed']),
      allowanceEur: z.number().min(0).optional(),
      runId: z.ulid().optional(),
      output: gateStageOutputSchema.optional(),
      spentEur: z.number().min(0).optional(),
      reason: z.string().min(1).max(2000).optional(),
    })
    .refine((payload) => payload.status !== 'run' || payload.runId !== undefined, {
      message: 'A stage run names its run',
      path: ['runId'],
    })
    .refine((payload) => payload.status !== 'completed' || payload.output !== undefined, {
      message: 'A completed stage hands on its output',
      path: ['output'],
    })
    .refine(
      (payload) =>
        (payload.status !== 'skipped' && payload.status !== 'failed') ||
        payload.reason !== undefined,
      { message: 'A skipped or failed stage says why', path: ['reason'] },
    ),
);

export type GateStageEvent = z.infer<typeof gateStageEventSchema>;
