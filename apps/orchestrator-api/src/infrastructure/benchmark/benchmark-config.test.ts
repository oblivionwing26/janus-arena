import { describe, expect, it } from 'vitest';

import { loadBenchmarkSpec, parseBenchmarkSpec, repoBenchmarksPath } from './benchmark-config.js';

describe('benchmark config (F3.11)', () => {
  it('reads the shipped config for Juice Shop: six categories and the five reference challenges', async () => {
    const spec = await loadBenchmarkSpec(repoBenchmarksPath(), 'juice-shop');

    expect(Object.keys(spec.categories).sort()).toEqual([
      'Broken Access Control',
      'Broken Anti Automation',
      'Broken Authentication',
      'Improper Input Validation',
      'Injection',
      'XSS',
    ]);
    expect(spec.categories['Broken Anti Automation']).toEqual(['business-logic', 'brute-force']);
    expect(spec.reference).toHaveLength(5);
  });

  it('refuses a class the Red Team does not have, an empty category and an unknown target', () => {
    const base = (categories: string) =>
      `targets:\n  juice-shop:\n    categories:\n${categories}\n`;

    expect(() => parseBenchmarkSpec(base('      XSS: [ddos]'), 'juice-shop')).toThrow();
    expect(() => parseBenchmarkSpec(base('      XSS: []'), 'juice-shop')).toThrow();
    expect(() => parseBenchmarkSpec(base('      XSS: [xss]'), 'shoplab')).toThrow(/no target/);
  });
});
