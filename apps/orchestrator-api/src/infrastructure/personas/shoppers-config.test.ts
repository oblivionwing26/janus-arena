import { describe, expect, it } from 'vitest';

import { SHOPLAB_SHOPPER } from '../../domain/task/shopper-profile.js';
import {
  loadShoppersConfig,
  parseShoppersConfig,
  repoShoppersConfigPath,
} from './shoppers-config.js';

describe('config/shoppers.yaml', () => {
  it('keeps ShopLab’s shopper exactly as it was, so earlier runs stay comparable', async () => {
    const shoppers = await loadShoppersConfig(repoShoppersConfigPath());

    expect(shoppers.shoplab).toEqual(SHOPLAB_SHOPPER);
  });

  it('gives Juice Shop the details its checkout asks for, with a published test card', async () => {
    const juiceShop = (await loadShoppersConfig(repoShoppersConfigPath()))['juice-shop'];

    expect(juiceShop?.emailDomain).toBe('janus.test');
    expect(Object.keys(juiceShop?.details ?? {})).toEqual(
      expect.arrayContaining(['address', 'city', 'zip code', 'mobile number', 'card number']),
    );
    expect(juiceShop?.details['card number']).toBe('4111111111111111');
  });

  it('saves Juice Shop’s address and card in the account before the session', async () => {
    const juiceShop = (await loadShoppersConfig(repoShoppersConfigPath()))['juice-shop'];

    expect(juiceShop).toMatchObject({ account: 'preregistered', savedCheckout: true });
  });

  it('rejects a saved checkout on an account the persona creates itself', () => {
    expect(() =>
      parseShoppersConfig(
        'targets: { shop: { emailDomain: shop.test, savedCheckout: true, details: {} } }',
      ),
    ).toThrow(/preregistered/);
  });
});
