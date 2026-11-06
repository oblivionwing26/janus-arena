import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';
import { frictionSignalEventSchema } from './friction-signal.js';

// A screenshot taken because a friction signal fired at this step (F1.6). The image lives in
// the run's artifact store under `artifact`; the event only points at it. For the heatmap and
// the report (F1.10).
export const pageScreenshotEventSchema = defineEventSchema(
  'page.screenshot',
  1,
  z.object({
    stepIndex: z.int().min(0),
    url: z.url(),
    /** Artifact key, relative to the run: e.g. `carmen-retired-0/step-12.png`. */
    artifact: z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,199}\.png$/),
    detector: frictionSignalEventSchema.shape.payload.shape.detector,
  }),
);

export type PageScreenshotEvent = z.infer<typeof pageScreenshotEventSchema>;
