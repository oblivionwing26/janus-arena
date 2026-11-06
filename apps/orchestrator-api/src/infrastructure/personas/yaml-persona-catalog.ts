import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { modelRoleSchema } from '@janus/shared-kernel';
import { parse } from 'yaml';
import { z } from 'zod';

import { InvalidPersonaError } from '../../domain/persona/invalid-persona-error.js';
import { PersonaNotFoundError } from '../../domain/persona/persona-not-found-error.js';
import type { PersonaCatalogPort } from '../../domain/persona/persona-catalog-port.js';
import { Persona } from '../../domain/persona/persona.js';
import { PERSONA_BIASES } from '../../domain/persona/persona-bias.js';

// Shape only; the domain checks the rest (ranges, slug, baseline rules).
const personaFileSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  profile: z.string(),
  goal: z.string(),
  digitalLiteracy: z.number(),
  patience: z.strictObject({ maxSteps: z.number(), maxSeconds: z.number() }),
  device: z.enum(['desktop', 'mobile']),
  locale: z.string(),
  trustSensitivity: z.enum(['low', 'medium', 'high']),
  biases: z.array(z.enum(PERSONA_BIASES)),
  modelRole: modelRoleSchema.extract(['navigator', 'competent-baseline']),
  rationale: z.string(),
});

/** Reads one persona YAML file. The file name (without .yaml) must be the persona id. */
export function parsePersonaFile(fileName: string, source: string): Persona {
  const expectedId = basename(fileName, '.yaml');
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    throw new InvalidPersonaError(expectedId, `not valid YAML (${String(error)})`);
  }
  const result = personaFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new InvalidPersonaError(expectedId, issues);
  }
  if (result.data.id !== expectedId) {
    throw new InvalidPersonaError(expectedId, `id ${result.data.id} does not match the file name`);
  }
  return Persona.create(result.data);
}

/** Personas from `<dir>/*.yaml` (the repository's personas/ by default), read once. */
export class YamlPersonaCatalog implements PersonaCatalogPort {
  private loaded: Promise<Persona[]> | undefined;

  constructor(private readonly dir: string = repoPersonasDir()) {}

  list(): Promise<Persona[]> {
    this.loaded ??= this.load();
    return this.loaded.then((personas) => [...personas]);
  }

  async get(id: string): Promise<Persona> {
    const persona = (await this.list()).find((candidate) => candidate.id === id);
    if (persona === undefined) throw new PersonaNotFoundError(id);
    return persona;
  }

  private async load(): Promise<Persona[]> {
    const files = (await readdir(this.dir)).filter((file) => file.endsWith('.yaml'));
    const personas = await Promise.all(
      files.map(async (file) =>
        parsePersonaFile(file, await readFile(join(this.dir, file), 'utf8')),
      ),
    );
    return personas.sort((a, b) => a.id.localeCompare(b.id));
  }
}

/** personas/ at the repository root, wherever this module runs from (src or dist). */
export function repoPersonasDir(): string {
  return fileURLToPath(new URL('../../../../../personas/', import.meta.url));
}
