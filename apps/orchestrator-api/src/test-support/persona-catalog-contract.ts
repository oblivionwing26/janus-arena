// Shared contract suite for PersonaCatalogPort: the in-memory fake and the YAML catalog both
// run it in `pnpm test`. Not part of the build.

import { describe, expect, it } from 'vitest';

import { PersonaNotFoundError } from '../domain/persona/persona-not-found-error.js';
import type { PersonaCatalogPort } from '../domain/persona/persona-catalog-port.js';
import type { PersonaProps } from '../domain/persona/persona.js';

export function samplePersona(id: string, patch: Partial<PersonaProps> = {}): PersonaProps {
  return {
    id,
    name: 'Muestra',
    profile: 'Office worker who buys online every few weeks.',
    goal: 'Buy a ceramic mug and have it sent home.',
    digitalLiteracy: 3,
    patience: { maxSteps: 30, maxSeconds: 300 },
    device: 'desktop',
    locale: 'es-ES',
    trustSensitivity: 'medium',
    biases: ['skims-text'],
    modelRole: 'navigator',
    rationale: 'A middle-of-the-road shopper used by contract tests.',
    ...patch,
  };
}

export function describePersonaCatalogContract(
  name: string,
  catalog: (personas: readonly PersonaProps[]) => Promise<PersonaCatalogPort>,
): void {
  describe(`PersonaCatalogPort contract: ${name}`, () => {
    const personas = [
      samplePersona('zoe-mobile', { device: 'mobile', biases: [] }),
      samplePersona('ana-careful', { biases: ['double-checks', 'privacy-cautious'] }),
    ];

    it('lists every persona sorted by id', async () => {
      const list = await (await catalog(personas)).list();

      expect(list.map((persona) => persona.id)).toEqual(['ana-careful', 'zoe-mobile']);
      expect(list[0]?.biases).toEqual(['double-checks', 'privacy-cautious']);
      expect(list[1]?.device).toBe('mobile');
    });

    it('gets one persona by id with all its fields', async () => {
      const persona = await (await catalog(personas)).get('ana-careful');

      expect(persona.goal).toBe('Buy a ceramic mug and have it sent home.');
      expect(persona.patience.maxSteps).toBe(30);
      expect(persona.modelRole).toBe('navigator');
    });

    it('fails clearly for an unknown id', async () => {
      await expect((await catalog(personas)).get('nobody')).rejects.toBeInstanceOf(
        PersonaNotFoundError,
      );
    });
  });
}
