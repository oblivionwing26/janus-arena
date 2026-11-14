import { describe, expect, it } from 'vitest';

import { InvalidRunConfigError } from './invalid-run-config-error.js';
import { assertValidRunConfig, type RunConfig } from './run-config.js';
import { clientAddress, saboteurAddress, sessionMatrix } from './session-matrix.js';

const BASE: RunConfig = {
  target: 'shoplab',
  variants: [
    { key: 'a', ref: 'main' },
    { key: 'b', ref: 'main', env: { SHOPLAB_RATE_LIMIT_IP: '20/30' } },
  ],
  personas: ['carmen-retired', 'tomas-hurried', 'rosa-meticulous'],
  seeds: [1, 2],
  budget: { maxTokens: 1_000_000, maxEur: 1 },
};

describe('a Launch Day run file (F4.1)', () => {
  it('accepts defenses per variant, saboteurs and a client address policy', () => {
    expect(() => {
      assertValidRunConfig({
        ...BASE,
        saboteurs: { count: 2, requestsPerSecond: 3 },
        clientIps: { mode: 'shared', addresses: 3 },
      });
    }).not.toThrow();
  });

  it('refuses a variant setting that is not an upper-case name with a plain value', () => {
    const withEnv = (env: Record<string, string>): RunConfig => ({
      ...BASE,
      variants: [{ key: 'a', ref: 'main', env }],
    });

    expect(() => {
      assertValidRunConfig(withEnv({ shoplab_rate: '1/2' }));
    }).toThrow(InvalidRunConfigError);
    expect(() => {
      assertValidRunConfig(withEnv({ SHOPLAB_X: '$(rm -rf /)' }));
    }).toThrow(InvalidRunConfigError);
    expect(() => {
      assertValidRunConfig(withEnv({ SHOPLAB_X: 'a;b' }));
    }).toThrow(InvalidRunConfigError);
  });

  it('keeps the saboteurs and the shared addresses within a sensible size', () => {
    const fails = (patch: Partial<RunConfig>) => {
      expect(() => {
        assertValidRunConfig({ ...BASE, ...patch });
      }).toThrow(InvalidRunConfigError);
    };

    fails({ saboteurs: { count: 0, requestsPerSecond: 3 } });
    fails({ saboteurs: { count: 6, requestsPerSecond: 3 } });
    fails({ saboteurs: { count: 2, requestsPerSecond: 21 } });
    fails({ clientIps: { mode: 'shared', addresses: 0 } });
    fails({ clientIps: { mode: 'shared', addresses: 51 } });
  });
});

describe('the address of each session (F4.1)', () => {
  it('gives none unless the run asks for them, so earlier runs are unchanged', () => {
    expect(sessionMatrix(BASE).every((slot) => slot.clientIp === undefined)).toBe(true);
  });

  it('gives each slot its own address, the same one on both variants of a pair', () => {
    const slots = sessionMatrix({ ...BASE, clientIps: { mode: 'distinct' } });

    const carmen = slots.filter((s) => s.persona === 'carmen-retired' && s.seed === 1);
    expect(carmen.map((s) => s.variant).sort()).toEqual(['a', 'b']);
    expect(new Set(carmen.map((s) => s.clientIp)).size).toBe(1);
    const persona = slots.filter((s) => s.kind === 'persona');
    expect(new Set(persona.map((s) => s.clientIp)).size).toBe(6);
    expect(persona.every((s) => /^10\.20\.0\.\d+$/.test(s.clientIp ?? ''))).toBe(true);
  });

  it('puts every legitimate session behind a few shared addresses when it is asked to', () => {
    const slots = sessionMatrix({ ...BASE, clientIps: { mode: 'shared', addresses: 2 } });

    const addresses = new Set(slots.map((s) => s.clientIp));
    expect([...addresses].sort()).toEqual(['10.30.0.1', '10.30.0.2']);
  });

  it('numbers the addresses without repeating one before 250 slots', () => {
    expect(clientAddress({ mode: 'distinct' }, 0)).toBe('10.20.0.1');
    expect(clientAddress({ mode: 'distinct' }, 249)).toBe('10.20.0.250');
    expect(clientAddress({ mode: 'distinct' }, 250)).toBe('10.20.1.1');
    expect(clientAddress({ mode: 'shared', addresses: 3 }, 4)).toBe('10.30.0.2');
  });
});

describe('the saboteurs of a run (F4.1)', () => {
  const withSaboteurs: RunConfig = { ...BASE, saboteurs: { count: 2, requestsPerSecond: 4 } };

  it('adds the same saboteurs to every variant, first, each with an address of its own', () => {
    const saboteurs = sessionMatrix(withSaboteurs).filter((slot) => slot.kind === 'saboteur');

    expect(saboteurs).toHaveLength(4);
    expect(saboteurs.map((slot) => slot.sessionIndex)).toEqual([0, 1, 2, 3]);
    expect(saboteurs.map((slot) => [slot.variant, slot.clientIp])).toEqual([
      ['a', '10.99.0.1'],
      ['b', '10.99.0.1'],
      ['a', '10.99.0.2'],
      ['b', '10.99.0.2'],
    ]);
    expect(
      saboteurs.every((slot) => slot.requestsPerSecond === 4 && slot.persona === undefined),
    ).toBe(true);
    expect(saboteurAddress(4)).toBe('10.99.0.5');
  });

  it('leaves the shoppers as they were, only after the saboteurs', () => {
    const without = sessionMatrix(BASE);
    const withThem = sessionMatrix(withSaboteurs).filter((slot) => slot.kind !== 'saboteur');

    expect(withThem.map(({ sessionIndex: _index, ...slot }) => slot)).toEqual(
      without.map(({ sessionIndex: _index, ...slot }) => slot),
    );
    expect(sessionMatrix(BASE).some((slot) => slot.kind === 'saboteur')).toBe(false);
  });
});
