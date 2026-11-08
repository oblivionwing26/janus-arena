import { z } from 'zod';

import { defineEventSchema } from '../event-envelope.js';

// The HTTP surface of one side of a differential audit (F2.8), as F2.6 maps it from the code,
// so the console can show it as a table in live runs and replays alike.
export const surfaceMappedEventSchema = defineEventSchema(
  'surface.mapped',
  1,
  z.object({
    side: z.enum(['base', 'variant']),
    ref: z.string().min(1).max(100),
    sha: z.string().regex(/^[0-9a-f]{40}$/),
    endpoints: z
      .array(
        z.object({
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ALL']),
          route: z.string().min(1).max(300),
          auth: z.boolean(),
          ownerCheck: z.union([z.boolean(), z.literal('unknown')]),
          params: z.array(z.string().min(1).max(100)).max(50),
          file: z.string().min(1).max(300),
          line: z.int().min(1),
        }),
      )
      .max(1000),
  }),
);

export type SurfaceMappedEvent = z.infer<typeof surfaceMappedEventSchema>;
