import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { funnelsFileSchema, type ReportConfig } from '@janus/synthlab-report';
import { parse } from 'yaml';

/** Report settings per target from YAML, validated by the report's own schema (F1.10). */
export async function loadFunnelsConfig(path: string): Promise<Record<string, ReportConfig>> {
  return funnelsFileSchema.parse(parse(await readFile(path, 'utf8'))).targets;
}

/** config/funnels.yaml at the repository root, wherever this module runs from (src or dist). */
export function repoFunnelsConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/funnels.yaml', import.meta.url));
}
