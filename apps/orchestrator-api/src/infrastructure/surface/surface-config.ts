import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

const relativePath = z
  .string()
  .regex(/^[\w.-]+(\/[\w.-]+)*$/)
  .refine((path) => !path.split('/').includes('..'));

export const surfaceTargetSchema = z.object({
  /** Where to clone from when the target has no sandbox definition (Juice Shop, F2.6). */
  repo: z
    .string()
    .regex(/^https:\/\/\S+$/)
    .optional(),
  ref: z
    .string()
    .regex(/^[\w][\w./-]{0,99}$/)
    .optional(),
  framework: z.enum(['nextjs', 'express']),
  /** Express: the files that register routes (`app.get(...)`). */
  files: z.array(relativePath).default([]),
  /** Calls inside a handler that demand a session (`requireUser`), F2.6-B. */
  authCalls: z.array(z.string().min(1)).default([]),
  /** Express middlewares that demand a session (`security.isAuthorized`). */
  authMiddleware: z.array(z.string().min(1)).default([]),
  /** Calls that return the session's user without demanding it (`security.authenticatedUsers.from`). */
  sessionCalls: z.array(z.string().min(1)).default([]),
  /** Expressions that hold the session user's id (`req.body.UserId`, set by a middleware). */
  sessionIds: z.array(z.string().min(1)).default([]),
  /** Calls whose arguments say nothing about access control (`challengeUtils.solveIf`). */
  ignoreCalls: z.array(z.string().min(1)).default([]),
});

export type SurfaceTarget = z.infer<typeof surfaceTargetSchema>;

export async function loadSurfaceConfig(path: string): Promise<Record<string, SurfaceTarget>> {
  return z
    .object({ targets: z.record(z.string(), surfaceTargetSchema) })
    .parse(parse(await readFile(path, 'utf8'))).targets;
}

/** config/surface.yaml at the repository root, from src or dist alike. */
export function repoSurfaceConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/surface.yaml', import.meta.url));
}
