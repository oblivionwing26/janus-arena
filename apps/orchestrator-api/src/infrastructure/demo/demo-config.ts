import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import type { DemoStory } from '../../application/demo/plan-demo.js';

const schema = z.object({
  stories: z
    .array(
      z.object({
        id: z.ulid(),
        kind: z.enum(['ab', 'gate', 'launch-day']),
        title: z.string().min(1).max(120),
        summary: z.string().min(1).max(900),
      }),
    )
    .min(1),
});

/** The stories of the public demo, from config/demo.yaml (F3.12). */
export async function loadDemoStories(path: string): Promise<readonly DemoStory[]> {
  return schema.parse(parse(await readFile(path, 'utf8'))).stories;
}

/** config/demo.yaml at the repository root, from src or dist alike. */
export function repoDemoConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/demo.yaml', import.meta.url));
}
