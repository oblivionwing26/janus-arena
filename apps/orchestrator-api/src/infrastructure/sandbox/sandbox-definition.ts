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
  // Files the UI Engineer may edit (F2.3): globs, `**` across folders. Manifests, lockfiles,
  // env files and the ground truth are refused whatever these say (EditPolicy).
  uiEngineer: z
    .object({
      allow: z.array(z.string().regex(/^[\w*.[\]/-]+$/)).min(1),
      deny: z.array(z.string().regex(/^[\w*.[\]/-]+$/)).default([]),
    })
    .optional(),
  build: z.object({ setupTarget: imageTarget, appTarget: imageTarget }),
  // The target's own checks (F2.3): run without network in an image built from the workspace.
  checks: z.object({ target: imageTarget, command: z.array(z.string().min(1)).min(1) }).optional(),
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

// A target run from a published image, unmodified (Juice Shop, ADR 0006, F3.1): no clone, no
// build, no separate database. The image is pinned by digest.
const imageSandboxDefinitionSchema = z.object({
  name: slug,
  image: z
    .string()
    .regex(/^[a-z0-9][\w./-]*:[\w.-]+@sha256:[0-9a-f]{64}$/, 'image must be pinned by digest'),
  app: z.object({
    port: z.int().min(1).max(65535),
    // The image has no healthcheck and no shell: it is ready when it logs this line.
    readyLog: z.string().min(1),
  }),
  // Where the app serves /.well-known from, for the ownership token (F3.1).
  verification: z.object({ dir: z.string().regex(/^(\/[\w.-]+)+$/) }),
  // Environment for the app container: plain names and values, nothing a shell could read.
  env: z
    .record(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), z.string().regex(/^[\w.:/-]{0,200}$/))
    .default({}),
  // How a patched variant is built (F3.5, ADR 0012): the image plus the recompiled files of a
  // patch to this source. Absent: the image cannot be patched.
  patch: z
    .object({
      repo: z.string().regex(/^https:\/\//, 'repo must be an https:// URL'),
      ref: z.string().regex(/^[\w.-]+$/),
      // A file of docker/sandboxes, never a path out of it.
      dockerfile: z.string().regex(/^[\w.-]+\.Dockerfile$/),
      excludeFiles: z.array(z.string().regex(/^[\w.-]+(\/[\w.-]+)*$/)).default([]),
      stripComments: z.array(z.string().regex(/^[\w -]{1,60}$/)).default([]),
      // What the Blue Team may edit: backend sources only (EditPolicy adds its own denials).
      blueTeam: z.object({
        allow: z.array(z.string().regex(/^[\w*.[\]/-]+$/)).min(1),
        deny: z.array(z.string().regex(/^[\w*.[\]/-]+$/)).default([]),
      }),
    })
    .optional(),
});

export type ImageSandboxDefinition = z.infer<typeof imageSandboxDefinitionSchema>;
export type AnySandboxDefinition = SandboxDefinition | ImageSandboxDefinition;

export function parseSandboxDefinition(source: string): SandboxDefinition {
  return sandboxDefinitionSchema.parse(parse(source));
}

/** A built (repo + Dockerfile) or an image definition, told apart by its `image` key. */
export function parseAnySandboxDefinition(source: string): AnySandboxDefinition {
  const raw: unknown = parse(source);
  return typeof raw === 'object' && raw !== null && 'image' in raw
    ? imageSandboxDefinitionSchema.parse(raw)
    : sandboxDefinitionSchema.parse(raw);
}

export function isImageDefinition(
  definition: AnySandboxDefinition,
): definition is ImageSandboxDefinition {
  return 'image' in definition;
}

/** docker/sandboxes at the repository root, from src or dist alike. */
export function sandboxDefinitionsDir(): string {
  return fileURLToPath(new URL('../../../../../docker/sandboxes/', import.meta.url));
}

/** A built target's definition: what code-changing agents and the A/B need (repo, build). */
export async function loadSandboxDefinition(
  target: string,
  dir = sandboxDefinitionsDir(),
): Promise<SandboxDefinition> {
  const definition = await loadAnySandboxDefinition(target, dir);
  if (isImageDefinition(definition)) {
    throw new Error(`docker/sandboxes/${target}.yaml runs an image; it has no repo to build`);
  }
  return definition;
}

export async function loadAnySandboxDefinition(
  target: string,
  dir = sandboxDefinitionsDir(),
): Promise<AnySandboxDefinition> {
  slug.parse(target);
  const definition = parseAnySandboxDefinition(await readFile(`${dir}${target}.yaml`, 'utf8'));
  if (definition.name !== target) {
    throw new Error(`docker/sandboxes/${target}.yaml declares name ${definition.name}`);
  }
  return definition;
}
