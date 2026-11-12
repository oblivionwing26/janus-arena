import { z } from 'zod';

const count = z.object({ successes: z.int().min(0), n: z.int().min(0) }).nullable();
/** A report's measurements, saved next to its Markdown so alternatives can be added later. */
export const savedTradeoffSchema = z.object({
  rows: z.array(
    z.object({
      label: z.string().min(1).max(100),
      strategy: z.string().min(1).max(100).nullable(),
      patchId: z.ulid().nullable(),
      exploitable: z.boolean().nullable(),
      ux: z
        .object({
          runId: z.ulid(),
          a: count,
          b: count,
          latency: z.array(
            z.object({
              endpoint: z.string().min(1).max(300),
              a: z.number().nullable(),
              b: z.number().nullable(),
            }),
          ),
        })
        .nullable(),
      uxPassed: z.boolean().nullable(),
      note: z.string().max(5000),
    }),
  ),
  diffs: z.record(z.string(), z.string()),
  costEur: z.number().min(0),
});
