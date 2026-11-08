import { describe, expect, it } from 'vitest';

import { NetworkGuard } from '../../domain/scope/network-guard.js';
import { loadScopeConfig, repoScopeConfigPath, scopePolicyFor } from './scope-config.js';

const ORIGIN = 'http://janus-juice-shop-app:3000';

describe('config/scopes.yaml', () => {
  it('keeps Juice Shop ground truth out of reach, however it is asked for', async () => {
    const targets = await loadScopeConfig(repoScopeConfigPath());
    const guard = new NetworkGuard(scopePolicyFor(targets, 'juice-shop', [ORIGIN]));

    for (const path of [
      '/api/Challenges',
      '/api/challenges/?sort=name',
      '/api/Challenges/1',
      '/api/Hints',
      '/snippets/loginAdminChallenge',
      '/snippets/fixes/loginAdminChallenge',
      '/rest/continue-code',
      '/rest/continue-code-findIt',
    ]) {
      expect(
        guard.check({ method: 'GET', url: `${ORIGIN}${path}`, testType: 'http-probe' }),
      ).toEqual({ allowed: false, reason: 'excluded-path' });
    }
    expect(
      guard.check({ method: 'GET', url: `${ORIGIN}/rest/products/search`, testType: 'http-probe' }),
    ).toEqual({ allowed: true });
  });

  it('allows no security test against ShopLab', async () => {
    const targets = await loadScopeConfig(repoScopeConfigPath());

    expect(scopePolicyFor(targets, 'shoplab', ['http://janus-a-app:3000']).allowedTests).toEqual([
      'browse',
      'http-probe',
    ]);
  });

  it('refuses a target with no scope', async () => {
    const targets = await loadScopeConfig(repoScopeConfigPath());

    expect(() => scopePolicyFor(targets, 'someone-else', [ORIGIN])).toThrow('No scope');
  });
});
