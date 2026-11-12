import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// The API requests a page made during one step, with how long each took (F3.5, V3: the p95 of
// the endpoints a security fix touches). Paths only: no query string, so no ids or tokens in
// it beyond the path itself, and never bodies or headers.
export const pageRequestsEventSchema = defineEventSchema(
  'page.requests',
  1,
  z.object({
    stepIndex: z.int().min(0),
    requests: z
      .array(
        z.object({
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
          path: z.string().startsWith('/').max(300),
          status: z.int().min(0).max(599),
          ms: z.number().min(0).max(600_000),
        }),
      )
      .min(1)
      .max(200),
  }),
);

export type PageRequestsEvent = z.infer<typeof pageRequestsEventSchema>;
