import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
const imageTarget = z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/);

const sandboxDefinitionSchema = z.object({
  name: slug,
  repo: z.string().regex(/^(https:\/\/|file:\/\/)/, 'repo must be an https:// or file:// URL'),
  // Paths inside the cloned workspace; no `.` or `..` segments, so nothing outside it.
  excludeFiles: z
    .array(
      z
        .string()
        .regex(/^[\w.-]+(\/[\w.-]+)*$/)
        .refine((path) => path.split('/').every((part) => part !== '.' && part !== '..')),
    )
    .default([]),
  build: z.object({ setupTarget: imageTarget, appTarget: imageTarget }),
  database: z.object({
    image: z.string().min(1),
    user: slug,
    password: z.string().min(1),
    name: slug,
  }),
  setup: z.object({ command: z.array(z.string().min(1)).min(1) }),
  app: z.object({
    port: z.int().min(1).max(65535),
    healthPath: z.string().startsWith('/'),
  }),
});

export type SandboxDefinition = z.infer<typeof sandboxDefinitionSchema>;

export function parseSandboxDefinition(source: string): SandboxDefinition {
  return sandboxDefinitionSchema.parse(parse(source));
}

/** docker/sandboxes at the repository root, from src or dist alike. */
export function sandboxDefinitionsDir(): string {
  return fileURLToPath(new URL('../../../../../docker/sandboxes/', import.meta.url));
}

export async function loadSandboxDefinition(
  target: string,
  dir = sandboxDefinitionsDir(),
): Promise<SandboxDefinition> {
  slug.parse(target);
  const definition = parseSandboxDefinition(await readFile(`${dir}${target}.yaml`, 'utf8'));
  if (definition.name !== target) {
    throw new Error(`docker/sandboxes/${target}.yaml declares name ${definition.name}`);
  }
  return definition;
}
