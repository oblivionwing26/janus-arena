import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { testTypeSchema } from '@janus/shared-kernel';
import { parse } from 'yaml';
import { z } from 'zod';

import { createScopePolicy, type ScopePolicy } from '../../domain/scope/scope-policy.js';

const scopeTargetSchema = z.object({
  allowedTests: z.array(testTypeSchema).min(1),
  excludedPaths: z.array(z.string().min(1).max(200)).default([]),
  maxRequestsPerSecond: z.number().positive().max(1000),
});

export type ScopeTarget = z.infer<typeof scopeTargetSchema>;

export async function loadScopeConfig(path: string): Promise<Record<string, ScopeTarget>> {
  return z
    .object({ targets: z.record(z.string(), scopeTargetSchema) })
    .parse(parse(await readFile(path, 'utf8'))).targets;
}

/** The target's policy for the origins its sandboxed variants answer on. */
export function scopePolicyFor(
  targets: Readonly<Record<string, ScopeTarget>>,
  target: string,
  origins: readonly string[],
): ScopePolicy {
  const config = targets[target];
  if (config === undefined) throw new Error(`No scope for target ${target} in config/scopes.yaml`);
  return createScopePolicy({ target, origins, ...config });
}

/** config/scopes.yaml at the repository root, from src or dist alike. */
export function repoScopeConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/scopes.yaml', import.meta.url));
}
