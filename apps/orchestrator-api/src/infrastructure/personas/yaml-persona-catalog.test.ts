import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { InvalidPersonaError } from '../../domain/persona/invalid-persona-error.js';
import {
  describePersonaCatalogContract,
  samplePersona,
} from '../../test-support/persona-catalog-contract.js';
import { parsePersonaFile, YamlPersonaCatalog } from './yaml-persona-catalog.js';

describePersonaCatalogContract('YamlPersonaCatalog', async (personas) => {
  const dir = await mkdtemp(join(tmpdir(), 'janus-personas-'));
  await Promise.all(
    personas.map((persona) => writeFile(join(dir, `${persona.id}.yaml`), stringify(persona))),
  );
  return new YamlPersonaCatalog(dir);
});

describe('persona YAML files', () => {
  it.each([
    ['an id that differs from the file name', 'other.yaml', stringify(samplePersona('ana'))],
    ['an unknown field', 'ana.yaml', stringify({ ...samplePersona('ana'), age: 70 })],
    ['an unknown bias', 'ana.yaml', stringify({ ...samplePersona('ana'), biases: ['lazy'] })],
    ['broken YAML', 'ana.yaml', 'id: [ana'],
  ])('rejects %s', (_label, file, source) => {
    expect(() => parsePersonaFile(file, source)).toThrow(InvalidPersonaError);
  });

  it('loads the repository personas: 8 navigators and the competent baseline', async () => {
    const personas = await new YamlPersonaCatalog().list();

    expect(personas.filter((persona) => persona.modelRole === 'navigator')).toHaveLength(8);
    const baseline = personas.filter((persona) => persona.modelRole === 'competent-baseline');
    expect(baseline.map((persona) => persona.id)).toEqual(['competent-baseline']);
    expect(new Set(personas.map((persona) => persona.rationale)).size).toBe(personas.length);
  });
});
