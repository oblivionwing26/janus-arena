import { describe, expect, it } from 'vitest';

import { InvalidVariantError } from '../../domain/sandbox/variant-spec.js';
import { appEnvironment } from './app-environment.js';

const SHOPLAB = {
  name: 'shoplab',
  env: { SHOPLAB_VERIFY_FILE: '/tmp/janus-verify.txt' },
  variantEnv: ['SHOPLAB_RATE_LIMIT_IP', 'SHOPLAB_STEP_UP_CHECKOUT'],
};

describe('the environment of a variant (F4.1)', () => {
  it('is what the definition fixes, plus what the variant asks for among the allowed keys', () => {
    expect(
      appEnvironment(SHOPLAB, { id: 'run-b', env: { SHOPLAB_RATE_LIMIT_IP: '20/30' } }),
    ).toEqual({ SHOPLAB_VERIFY_FILE: '/tmp/janus-verify.txt', SHOPLAB_RATE_LIMIT_IP: '20/30' });
    expect(appEnvironment(SHOPLAB, { id: 'run-a' })).toEqual(SHOPLAB.env);
  });

  it('refuses a key the definition does not list, naming it', () => {
    expect(() =>
      appEnvironment(SHOPLAB, { id: 'run-b', env: { NODE_OPTIONS: '--inspect' } }),
    ).toThrow(InvalidVariantError);
    expect(() =>
      appEnvironment(SHOPLAB, { id: 'run-b', env: { SHOPLAB_VERIFY_FILE: '/etc/passwd' } }),
    ).toThrow(/SHOPLAB_VERIFY_FILE/);
  });

  it('lets a target with no variantEnv take no setting at all (an image target)', () => {
    expect(() =>
      appEnvironment({ name: 'juice-shop', env: {} }, { id: 'x', env: { A: '1' } }),
    ).toThrow(InvalidVariantError);
  });
});
