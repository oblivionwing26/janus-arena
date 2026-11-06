import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parseFrictionConfig, type FrictionConfig } from '@janus/friction-engine';
import { parse } from 'yaml';

/** Friction thresholds from YAML, validated by the friction engine's own schema. */
export async function loadFrictionConfig(path: string): Promise<FrictionConfig> {
  return parseFrictionConfig(parse(await readFile(path, 'utf8')));
}

/** config/friction.yaml at the repository root, wherever this module runs from (src or dist). */
export function repoFrictionConfigPath(): string {
  return fileURLToPath(new URL('../../../../../config/friction.yaml', import.meta.url));
}
