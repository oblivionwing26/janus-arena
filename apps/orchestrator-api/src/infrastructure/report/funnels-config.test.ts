import { describe, expect, it } from 'vitest';

import { loadFunnelsConfig, repoFunnelsConfigPath } from './funnels-config.js';

describe('config/funnels.yaml', () => {
  it('is valid and gives ShopLab its funnel, from the home page to a confirmed order', async () => {
    const { shoplab } = await loadFunnelsConfig(repoFunnelsConfigPath());

    expect(shoplab?.funnel.map((step) => step.route)).toEqual([
      '/',
      '/products/:slug',
      '/cart',
      '/checkout',
      '/orders/:id',
    ]);
    expect(shoplab?.routes).toContain('/products/:slug');
  });
});
