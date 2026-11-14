import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { assertValidRunConfig } from '../../domain/run/run-config.js';
import { sessionMatrix } from '../../domain/run/session-matrix.js';
import { runConfigBodySchema, runConfigFromBody } from './start-run-body.js';

const dir = fileURLToPath(new URL('../../../../../runs/', import.meta.url));
const files = readdirSync(dir).filter((name) => /^launch-day-.*\.yaml$/.test(name));

describe('the Launch Day run files (F4.1c)', () => {
  it('has the smoke run and one run per defense', () => {
    expect(files).toEqual([
      'launch-day-account.yaml',
      'launch-day-ip.yaml',
      'launch-day-shared-ip-strict.yaml',
      'launch-day-shared-ip.yaml',
      'launch-day-smoke.yaml',
      'launch-day-step-up.yaml',
    ]);
  });

  it.each(files)('%s is valid, defends only variant B and stays inside its budget', (name) => {
    const body = runConfigBodySchema.parse(parse(readFileSync(`${dir}${name}`, 'utf8')));
    const config = runConfigFromBody(body);

    assertValidRunConfig(config);
    const [a, b] = config.variants;
    const defenses = (env: Readonly<Record<string, string>> | undefined) =>
      Object.keys(env ?? {}).filter((key) => key !== 'SHOPLAB_TRUST_FORWARDED_FOR');
    expect(defenses(a?.env)).toEqual([]);
    expect(defenses(b?.env)).toHaveLength(1);
    expect(a?.env?.SHOPLAB_TRUST_FORWARDED_FOR).toBe('1');
    expect(config.budget.maxEur).toBeLessThanOrEqual(0.4);
    expect(config.saboteurs).toEqual({ count: 2, requestsPerSecond: 5 });
    // Both variants play the same slots, paired.
    const slots = sessionMatrix(config);
    expect(slots.filter((slot) => slot.variant === 'a')).toHaveLength(
      slots.filter((slot) => slot.variant === 'b').length,
    );
  });

  it('gives the real runs 18 shoppers and 2 saboteurs per variant', () => {
    const body = runConfigBodySchema.parse(parse(readFileSync(`${dir}launch-day-ip.yaml`, 'utf8')));
    const slots = sessionMatrix(runConfigFromBody(body));

    const ofA = slots.filter((slot) => slot.variant === 'a');
    expect(ofA.filter((slot) => slot.kind === 'persona')).toHaveLength(18);
    expect(ofA.filter((slot) => slot.kind === 'saboteur')).toHaveLength(2);
  });
});
