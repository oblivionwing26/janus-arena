import { describe, expect, it } from 'vitest';

import { InvalidPersonaError } from './invalid-persona-error.js';
import { Persona, type PersonaProps } from './persona.js';

const valid: PersonaProps = {
  id: 'carmen-72',
  name: 'Carmen',
  profile: 'Retired teacher who shops online twice a year with help from her grandson.',
  goal: 'Buy a ceramic mug and have it sent home.',
  digitalLiteracy: 2,
  patience: { maxSteps: 40, maxSeconds: 600 },
  device: 'desktop',
  locale: 'es-ES',
  trustSensitivity: 'high',
  biases: ['literal-reader', 'double-checks'],
  modelRole: 'navigator',
  rationale: 'Low digital literacy with high patience: finds unclear labels, rarely gives up.',
};

describe('Persona', () => {
  it('keeps a valid profile as given', () => {
    const persona = Persona.create(valid);

    expect(persona.id).toBe('carmen-72');
    expect(persona.biases).toEqual(['literal-reader', 'double-checks']);
    expect(persona.patience.isExhausted({ steps: 40, elapsedMs: 0 })).toBe(true);
  });

  it.each<[string, Partial<PersonaProps>]>([
    ['an id that is not a slug', { id: 'Carmen 72' }],
    ['digital literacy outside 1-5', { digitalLiteracy: 6 }],
    ['fractional digital literacy', { digitalLiteracy: 2.5 }],
    ['an unknown bias', { biases: ['clicks-everything' as never] }],
    ['a repeated bias', { biases: ['skims-text', 'skims-text'] }],
    ['an empty goal', { goal: ' ' }],
    ['a rationale longer than one line', { rationale: 'one\ntwo' }],
    ['a locale that is not a language tag', { locale: 'spanish' }],
    [
      'a model role other than navigator or competent-baseline',
      { modelRole: 'architect' as never },
    ],
    ['a baseline with biases', { modelRole: 'competent-baseline', digitalLiteracy: 5 }],
    ['a baseline below full literacy', { modelRole: 'competent-baseline', biases: [] }],
  ])('rejects %s', (_label, patch) => {
    expect(() => Persona.create({ ...valid, ...patch })).toThrow(InvalidPersonaError);
  });

  it('caps its patience at a run step limit, never raising it', () => {
    const persona = Persona.create(valid);

    expect(persona.withMaxSteps(10).patience.maxSteps).toBe(10);
    expect(persona.withMaxSteps(10).patience.maxSeconds).toBe(600);
    expect(persona.withMaxSteps(100)).toBe(persona);
  });

  it('accepts the competent baseline: no biases, full literacy, its own model role', () => {
    const baseline = Persona.create({
      ...valid,
      id: 'competent-baseline',
      modelRole: 'competent-baseline',
      digitalLiteracy: 5,
      biases: [],
    });

    expect(baseline.modelRole).toBe('competent-baseline');
  });
});
