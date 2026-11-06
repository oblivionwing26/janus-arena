import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// Something technical went wrong on the page while an agent used it (F1.6 captures it):
// a console error, a 4xx/5xx response or a timeout. Input for the technical-error detector.
export const pageErrorEventSchema = defineEventSchema(
  'page.error',
  1,
  z.object({
    stepIndex: z.int().min(0),
    kind: z.enum(['console', 'http', 'timeout']),
    /** The resource for http and timeout errors; the page for console errors. */
    url: z.url(),
    status: z.int().min(100).max(599).optional(),
    message: z.string().min(1).max(500),
  }),
);

export type PageErrorEvent = z.infer<typeof pageErrorEventSchema>;
