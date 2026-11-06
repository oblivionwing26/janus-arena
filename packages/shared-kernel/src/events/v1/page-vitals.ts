import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// Core Web Vitals measured on the page during one agent step (F1.6 captures them). Each value is
// optional: a step only reports what the browser measured. Input for the performance detector.
export const pageVitalsEventSchema = defineEventSchema(
  'page.vitals',
  1,
  z.object({
    stepIndex: z.int().min(0),
    url: z.url(),
    lcpMs: z.number().min(0).optional(),
    cls: z.number().min(0).optional(),
    inpMs: z.number().min(0).optional(),
  }),
);

export type PageVitalsEvent = z.infer<typeof pageVitalsEventSchema>;
