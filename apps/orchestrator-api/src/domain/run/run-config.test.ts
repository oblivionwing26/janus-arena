import { describe, expect, it } from 'vitest';

import { InvalidRunConfigError } from './invalid-run-config-error.js';
import { assertValidRunConfig, type RunConfig } from './run-config.js';
import { sessionMatrix } from './session-matrix.js';

const config: RunConfig = {
  target: 'shoplab',
  variants: [
    { key: 'a', ref: 'main' },
    { key: 'b', ref: 'main' },
  ],
  personas: ['carmen-retired', 'diego-commuter'],
  seeds: [1, 2],
  maxSteps: 30,
  budget: { maxTokens: 400_000, maxEur: 0.5 },
  concurrency: 2,
};

describe('run config', () => {
  it('accepts a valid A/B config', () => {
    expect(() => {
      assertValidRunConfig(config);
    }).not.toThrow();
  });

  it.each<[string, Partial<RunConfig>]>([
    ['no variants', { variants: [] }],
    [
      'repeated variant keys',
      {
        variants: [
          { key: 'a', ref: 'main' },
          { key: 'a', ref: 'x' },
        ],
      },
    ],
    ['a variant key that is not short', { variants: [{ key: 'variant-b', ref: 'main' }] }],
    [
      'a patch base that is not a commit',
      { variants: [{ key: 'b', ref: 'x', repo: 'file:///w', base: 'main' }] },
    ],
    [
      'a patch base without its clone',
      { variants: [{ key: 'b', ref: 'x', base: 'c'.repeat(40) }] },
    ],
    ['a task without items', { tasks: [{ id: 't', goal: 'Buy', expect: { items: [] } }] }],
    [
      'repeated task ids',
      {
        tasks: [
          { id: 't', goal: 'Buy', expect: { items: [{ product: 'Taza', quantity: 1 }] } },
          { id: 't', goal: 'Buy', expect: { items: [{ product: 'Taza', quantity: 1 }] } },
        ],
      },
    ],
    [
      'a task quantity of 0',
      { tasks: [{ id: 't', goal: 'Buy', expect: { items: [{ product: 'Taza', quantity: 0 }] } }] },
    ],
    ['the baseline listed as a persona', { personas: ['competent-baseline'] }],
    ['repeated personas', { personas: ['carmen-retired', 'carmen-retired'] }],
    ['no seeds', { seeds: [] }],
    ['a fractional seed', { seeds: [1.5] }],
    ['zero max steps', { maxSteps: 0 }],
    ['concurrency above 10', { concurrency: 11 }],
    [
      'more than 100 sessions',
      {
        personas: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'],
        seeds: [1, 2, 3, 4, 5],
      },
    ],
  ])('rejects %s', (_label, patch) => {
    expect(() => {
      assertValidRunConfig({ ...config, ...patch });
    }).toThrow(InvalidRunConfigError);
  });
});

describe('sessionMatrix', () => {
  it('runs only baselines over every task for a baseline-only config (F1.9)', () => {
    const tasks = ['buy-mug', 'buy-two'].map((id) => ({
      id,
      goal: 'Buy something.',
      expect: { items: [{ product: 'Taza de cerámica', quantity: 1 }] },
    }));
    const baselineOnly = {
      ...config,
      variants: [{ key: 'a', ref: 'main' }],
      personas: [],
      seeds: [1, 2],
      tasks,
    };

    expect(() => {
      assertValidRunConfig(baselineOnly);
    }).not.toThrow();
    expect(
      sessionMatrix(baselineOnly).map(
        (slot) => `${slot.kind}:${slot.task ?? '-'}:${String(slot.seed)}`,
      ),
    ).toEqual([
      'baseline:buy-mug:1',
      'baseline:buy-two:1',
      'baseline:buy-mug:2',
      'baseline:buy-two:2',
    ]);
  });

  it('pairs every persona and seed across variants, and adds a baseline per variant and seed', () => {
    const slots = sessionMatrix(config).map(
      ({ sessionIndex, variant, kind, persona, seed }) =>
        `${String(sessionIndex)}:${variant}:${kind}:${persona ?? '-'}:${String(seed)}`,
    );

    expect(slots).toEqual([
      '0:a:persona:carmen-retired:1',
      '1:b:persona:carmen-retired:1',
      '2:a:persona:diego-commuter:1',
      '3:b:persona:diego-commuter:1',
      '4:a:persona:carmen-retired:2',
      '5:b:persona:carmen-retired:2',
      '6:a:persona:diego-commuter:2',
      '7:b:persona:diego-commuter:2',
      '8:a:baseline:competent-baseline:1',
      '9:b:baseline:competent-baseline:1',
      '10:a:baseline:competent-baseline:2',
      '11:b:baseline:competent-baseline:2',
    ]);
  });

  it('gives the F1.7 "Done when" run 10 sessions: 4 personas × 1 seed × 2 variants + 2 baselines', () => {
    const slots = sessionMatrix({
      ...config,
      personas: ['carmen-retired', 'diego-commuter', 'lucia-private', 'javier-budget'],
      seeds: [1],
    });
    expect(slots).toHaveLength(10);
    expect(slots.filter((slot) => slot.kind === 'baseline').map((slot) => slot.variant)).toEqual([
      'a',
      'b',
    ]);
  });
});
