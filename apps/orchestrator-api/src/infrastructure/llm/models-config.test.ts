import { describe, expect, it } from 'vitest';

import { loadModelsConfig, parseModelsConfig, repoModelsConfigPath } from './models-config.js';

const valid = `
usdToEur: 0.9
roles:
  navigator: { model: m-small, maxTokens: 100, effort: low }
  competent-baseline: { model: m-big, maxTokens: 200 }
  ui-engineer: { model: m-big, maxTokens: 200 }
  red-team: { model: m-big, maxTokens: 200 }
  blue-team: { model: m-big, maxTokens: 200 }
  architect: { model: m-big, maxTokens: 200 }
prices:
  m-small: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 }
  m-big: { input: 3, output: 4, cacheRead: 0.3, cacheWrite: 3.75 }
`;

describe('models config', () => {
  it('loads the repository config/models.yaml', async () => {
    const config = await loadModelsConfig(repoModelsConfigPath());

    expect(Object.keys(config.roles).sort()).toEqual([
      'architect',
      'blue-team',
      'competent-baseline',
      'navigator',
      'red-team',
      'ui-engineer',
    ]);
    for (const role of Object.values(config.roles)) {
      expect(config.prices[role.model]).toBeDefined();
    }
  });

  it('parses a valid document', () => {
    const config = parseModelsConfig(valid);

    expect(config.usdToEur).toBe(0.9);
    expect(config.roles.navigator).toEqual({ model: 'm-small', maxTokens: 100, effort: 'low' });
  });

  it('rejects a role without a price for its model', () => {
    expect(() => parseModelsConfig(valid.replace('m-small: { input', 'm-other: { input'))).toThrow(
      /no price for model m-small/,
    );
  });

  it('rejects a missing role', () => {
    expect(() => parseModelsConfig(valid.replace(/^ {2}architect:.*$/m, ''))).toThrow();
  });

  it('rejects negative prices and unknown effort levels', () => {
    expect(() => parseModelsConfig(valid.replace('input: 1,', 'input: -1,'))).toThrow();
    expect(() => parseModelsConfig(valid.replace('effort: low', 'effort: turbo'))).toThrow();
  });
});
