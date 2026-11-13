import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { redTeamClassSchema } from '@janus/shared-kernel';
import { parse } from 'yaml';
import { z } from 'zod';

import type { BenchmarkSpec } from '../../domain/benchmark/benchmark-spec.js';

const schema = z.object({
  targets: z.record(
    z.string(),
    z.object({
      categories: z
        .record(z.string().min(1), z.array(redTeamClassSchema).min(1))
        .refine((categories) => Object.keys(categories).length > 0, 'at least one category'),
      reference: z.array(z.string().min(1)).default([]),
      sideEffects: z.record(z.string().min(1), z.string().min(1)).default({}),
    }),
  ),
});

/** What counts in a target's benchmark, from config/benchmarks.yaml (F3.11). */
export function parseBenchmarkSpec(text: string, target: string): BenchmarkSpec {
  const found = schema.parse(parse(text)).targets[target];
  if (found === undefined) throw new Error(`config/benchmarks.yaml has no target ${target}`);
  return {
    target,
    categories: found.categories,
    reference: found.reference,
    sideEffects: found.sideEffects,
  };
}

/** config/benchmarks.yaml: read only by the orchestrator, never by an agent. */
export async function loadBenchmarkSpec(path: string, target: string): Promise<BenchmarkSpec> {
  return parseBenchmarkSpec(await readFile(path, 'utf8'), target);
}

/** config/benchmarks.yaml at the repository root, from src or dist alike. */
export function repoBenchmarksPath(): string {
  return fileURLToPath(new URL('../../../../../config/benchmarks.yaml', import.meta.url));
}
