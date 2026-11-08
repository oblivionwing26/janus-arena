import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { proofOfConceptSchema, type ProofOfConcept } from '@janus/shared-kernel';

/** Reads and validates PoC JSON, as saved by a Red Team run (F3.4). */
export function parsePoc(text: string): ProofOfConcept {
  return proofOfConceptSchema.parse(JSON.parse(text));
}

/** Every `*.json` PoC in a folder, sorted by file name, each validated. */
export async function readPocDir(
  dir: string,
): Promise<readonly { readonly name: string; readonly poc: ProofOfConcept }[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(
    names.map(async (name) => ({ name, poc: parsePoc(await readFile(join(dir, name), 'utf8')) })),
  );
}
