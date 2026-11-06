import { z } from 'zod';

import { frictionSignalEventSchema } from '../events/v1/friction-signal.js';
import { modelRoleSchema } from '../events/model-role.js';

// The SynthLab report of a run (F1.10), computed by code from the run's events only
// (packages/synthlab-report). The API serves it, `pnpm run:report` writes it as JSON and the
// console draws it. It speaks of synthetic task success, never of conversion.

const detectorSchema = frictionSignalEventSchema.shape.payload.shape.detector;
const count = z.int().min(0);
const share = z.number().min(0).max(1);

const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
});

const screenshotSchema = z.object({
  agentId: z.string().min(1),
  stepIndex: z.int().min(0),
  /** Artifact key relative to the run, as page.screenshot records it. */
  artifact: z.string().min(1),
});

/** A place where friction concentrates: a route, and the element when signals point at one. */
export const frictionZoneSchema = z.object({
  rank: z.int().min(1),
  /** Normalised path pattern, e.g. `/products/:slug`. */
  route: z.string().startsWith('/'),
  /** The element the agents acted on (`role=button[name="Crear cuenta"]`); null for the page. */
  element: z.string().min(1).nullable(),
  /** Each session counts once, by its worst signal here: a loop does not outweigh many users. */
  intensity: z.number().min(0),
  signals: count,
  sessions: count,
  detectors: z.array(z.object({ detector: detectorSchema, signals: count })),
  /** Where the element was on the viewport, one per action that the signals point at. */
  boxes: z.array(boxSchema.extend({ agentId: z.string().min(1), stepIndex: z.int().min(0) })),
  screenshot: screenshotSchema.nullable(),
  /** The first evidence events, for drilling into the timeline. */
  evidenceEventIds: z.array(z.ulid()).max(20),
});

const rateSchema = z.object({
  rate: share,
  low: share,
  high: share,
  successes: count,
  n: count,
});

export const synthlabReportSchema = z.object({
  format: z.literal('janus-synthlab-report'),
  version: z.literal(1),
  runId: z.ulid(),
  /** The events the report was computed from: the same events give the same report. */
  source: z.object({ events: count, lastSeq: z.int().min(0) }),
  sessions: z.object({
    persona: count,
    baseline: count,
    excluded: z.array(z.object({ agentId: z.string().min(1), reason: z.string().min(1) })),
  }),
  funnel: z.array(
    z.object({
      variant: z.string().min(1),
      /** Persona sessions of the variant; the baseline is a reference and is left out. */
      sessions: count,
      steps: z.array(
        z.object({ name: z.string().min(1), route: z.string(), reached: count, rate: share }),
      ),
    }),
  ),
  zones: z.array(frictionZoneSchema),
  /** The same ranking within each variant (F1.11), to see what a variant fixed or broke. */
  zonesByVariant: z
    .array(z.object({ variant: z.string().min(1), zones: z.array(frictionZoneSchema) }))
    .optional(),
  detectors: z.array(z.object({ detector: detectorSchema, signals: count, sessions: count })),
  success: z.object({
    variants: z.array(
      z.object({
        variant: z.string().min(1),
        personas: rateSchema.nullable(),
        baseline: z.object({ successes: count, n: count }),
      }),
    ),
    comparison: z
      .object({
        a: z.string().min(1),
        b: z.string().min(1),
        pairs: count,
        difference: z
          .object({
            mean: z.number(),
            low: z.number(),
            high: z.number(),
            level: z.number(),
            resamples: count,
            seed: z.int(),
          })
          .nullable(),
        verdict: z.enum(['no-detectable-difference', 'b-higher', 'b-lower']).nullable(),
      })
      .nullable(),
  }),
  cost: z.object({
    calls: count,
    inputTokens: count,
    outputTokens: count,
    cacheReadInputTokens: count,
    cacheCreationInputTokens: count,
    estimatedEur: z.number().min(0),
    byRole: z.array(
      z.object({ role: modelRoleSchema, calls: count, estimatedEur: z.number().min(0) }),
    ),
  }),
});

export type FrictionZone = z.infer<typeof frictionZoneSchema>;
export type SynthlabReport = z.infer<typeof synthlabReportSchema>;
