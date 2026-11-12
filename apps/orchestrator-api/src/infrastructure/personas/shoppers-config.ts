import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import type { ShopperProfile } from '../../domain/task/shopper-profile.js';

const profileSchema = z
  .object({
    emailDomain: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
    details: z.record(z.string().min(1).max(40), z.string().max(200)),
    account: z.enum(['self-registers', 'preregistered']).optional(),
    savedCheckout: z.boolean().optional(),
  })
  .refine((profile) => profile.savedCheckout !== true || profile.account === 'preregistered', {
    message: 'savedCheckout needs a preregistered account',
  });

/** The text of config/shoppers.yaml: each target's synthetic shopper details (F3.5a). */
export function parseShoppersConfig(text: string): Readonly<Record<string, ShopperProfile>> {
  return z.object({ targets: z.record(z.string(), profileSchema) }).parse(parse(text)).targets;
}

/** config/shoppers.yaml: each target's synthetic shopper details (F3.5a). */
export async function loadShoppersConfig(
  path: string,
): Promise<Readonly<Record<string, ShopperProfile>>> {
  return parseShoppersConfig(await readFile(path, 'utf8'));
}

/** config/shoppers.yaml at the repository root, from src or dist alike. */
export function repoShoppersConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/shoppers.yaml', import.meta.url));
}
