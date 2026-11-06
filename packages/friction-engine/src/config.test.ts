import { describe, expect, it } from 'vitest';

import {
  defaultFrictionConfig,
  InvalidFrictionConfigError,
  parseFrictionConfig,
} from './config.js';

describe('friction config', () => {
  it('accepts the defaults', () => {
    expect(parseFrictionConfig(defaultFrictionConfig)).toEqual(defaultFrictionConfig);
  });

  it.each([
    ['an unknown section', { ...defaultFrictionConfig, hesitation: {} }],
    [
      'a rage click of one click',
      { ...defaultFrictionConfig, rageClick: { ...defaultFrictionConfig.rageClick, minClicks: 1 } },
    ],
    [
      'a "poor" line below "needs improvement"',
      {
        ...defaultFrictionConfig,
        performance: { ...defaultFrictionConfig.performance, cls: { medium: 0.25, high: 0.1 } },
      },
    ],
    [
      'extra-step levels out of order',
      { ...defaultFrictionConfig, extraSteps: { low: 2, medium: 1.5, high: 3 } },
    ],
  ])('rejects %s', (_label, config) => {
    expect(() => parseFrictionConfig(config)).toThrow(InvalidFrictionConfigError);
  });
});
