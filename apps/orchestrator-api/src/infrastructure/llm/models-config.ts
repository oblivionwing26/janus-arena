import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { modelRoleSchema, type ModelRole } from '@janus/shared-kernel';
import { parse } from 'yaml';
import { z } from 'zod';

const priceSchema = z.object({
  input: z.number().min(0),
  output: z.number().min(0),
  cacheRead: z.number().min(0),
  cacheWrite: z.number().min(0),
});

const roleConfigSchema = z.object({
  model: z.string().min(1),
  maxTokens: z.int().positive(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
});

const modelsConfigSchema = z
  .object({
    usdToEur: z.number().positive(),
    roles: z.record(modelRoleSchema, roleConfigSchema),
    prices: z.record(z.string().min(1), priceSchema),
  })
  .superRefine((config, ctx) => {
    for (const [role, { model }] of Object.entries(config.roles)) {
      if (!(model in config.prices)) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', role],
          message: `no price for model ${model}`,
        });
      }
    }
  });

export type ModelsConfig = z.infer<typeof modelsConfigSchema>;
export type RoleConfig = ModelsConfig['roles'][ModelRole];

export function parseModelsConfig(source: string): ModelsConfig {
  return modelsConfigSchema.parse(parse(source));
}

export async function loadModelsConfig(path: string): Promise<ModelsConfig> {
  return parseModelsConfig(await readFile(path, 'utf8'));
}

/** config/models.yaml at the repository root, wherever this module runs from (src or dist). */
export function repoModelsConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/models.yaml', import.meta.url));
}
