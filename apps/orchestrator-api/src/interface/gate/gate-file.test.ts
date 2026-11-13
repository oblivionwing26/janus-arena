import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GateBudget } from '../../domain/gate/gate-budget.js';
import { gateFileSchema, loadGateFile } from './gate-file.js';

const gates = fileURLToPath(new URL('../../../../../gates/', import.meta.url));

describe('gate files (F3.9)', () => {
  it.each(['juice-shop', 'shoplab'])(
    'gates/%s.yaml is valid and its budget splits',
    async (name) => {
      const gate = await loadGateFile(`${gates}${name}.yaml`);

      expect(gate.target).toBe(name);
      expect(() => new GateBudget(gate.budget.maxEur, gate.budget.shares)).not.toThrow();
    },
  );

  it('fills the defaults and refuses a gate that opens no PR without saying why', () => {
    const minimal = {
      target: 'shoplab',
      runFile: 'runs/ab-auto.yaml',
      budget: { maxEur: 1, shares: {} },
    };

    expect(gateFileSchema.parse(minimal)).toMatchObject({
      variant: { zones: 2 },
      blueTeam: { maxFixes: 1 },
      pr: { open: true },
    });
    expect(gateFileSchema.safeParse({ ...minimal, pr: { open: false } }).success).toBe(false);
    expect(
      gateFileSchema.safeParse({ ...minimal, budget: { maxEur: 1, shares: { deploy: 0.5 } } })
        .success,
    ).toBe(false);
  });
});
