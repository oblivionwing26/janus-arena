import { z } from 'zod';

// What the report needs to know about a target (F1.10): its route patterns and its purchase
// funnel. Read from config/funnels.yaml by the orchestrator, validated here.
export const reportConfigSchema = z.object({
  /** Path patterns with `:param` segments, e.g. `/products/:slug`. */
  routes: z.array(z.string().startsWith('/')).default([]),
  funnel: z.array(z.object({ name: z.string().min(1), route: z.string().startsWith('/') })).min(1),
  /** How many zones the report keeps, most intense first. */
  topZones: z.int().min(1).max(50).default(10),
});

export type ReportConfig = z.infer<typeof reportConfigSchema>;

/** The file: one entry per target. */
export const funnelsFileSchema = z.object({ targets: z.record(z.string(), reportConfigSchema) });
